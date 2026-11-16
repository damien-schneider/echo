use anyhow::{Context, Result};
use std::future::Future;

use super::process_lifecycle::{is_connection_failure, ServerState};
use super::PolishRuntime;

impl PolishRuntime {
    pub(super) async fn run_with_restart<T, Operation, OperationFuture>(
        &self,
        mut operation: Operation,
    ) -> Result<T>
    where
        Operation: FnMut() -> OperationFuture,
        OperationFuture: Future<Output = Result<T>>,
    {
        let first_error = match self.attempt(operation()).await {
            Ok(output) => return Ok(output),
            Err(error) => error,
        };
        self.ensure_running()?;
        let server_lost = self
            .record_crash_if_server_lost(&first_error)
            .await
            .with_context(|| format!("Failed to stop Polish runtime after: {first_error}"))?;
        if !server_lost {
            return Err(first_error);
        }
        self.ensure_ready()
            .await
            .with_context(|| format!("Polish runtime did not recover after: {first_error}"))?;
        let second_error = match self.attempt(operation()).await {
            Ok(output) => return Ok(output),
            Err(error) => error,
        };
        let server_lost = self
            .record_crash_if_server_lost(&second_error)
            .await
            .context("Failed to stop Polish runtime after retry")?;
        if !server_lost {
            return Err(second_error);
        }
        Err(second_error).context("Polish runtime failed after one restart")
    }

    async fn attempt<T>(&self, request: impl Future<Output = Result<T>>) -> Result<T> {
        let output = request.await?;
        // startup holds this lock for up to a minute; an answer must not wait behind it
        if let Ok(mut process) = self.process.try_lock() {
            process.restart_count = 0;
        }
        Ok(output)
    }

    async fn record_crash_if_server_lost(&self, failure: &anyhow::Error) -> Result<bool> {
        let mut process = self.process.lock().await;
        self.refresh_process_state(&mut process)?;
        if process.state != ServerState::Ready {
            return Ok(true);
        }
        if !is_connection_failure(failure) {
            return Ok(false);
        }
        process.terminate().await?;
        process.record_crash();
        Ok(true)
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::features::polish::runtime::process_lifecycle::{
        await_local_operation, ConnectionFailure,
    };
    use crate::features::polish::runtime::protocol::parse_chat_response;
    use crate::features::polish::runtime::PolishRuntimeConfig;
    use std::future::pending;
    use std::io;
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::time::Duration;
    use tokio::process::{Child, Command};

    fn idle_server() -> Child {
        Command::new("/bin/sleep")
            .arg("60")
            .kill_on_drop(true)
            .spawn()
            .unwrap()
    }

    async fn serve(runtime: &PolishRuntime, server: Child) {
        let mut process = runtime.process.lock().await;
        process.child = Some(server);
        process.state = ServerState::Ready;
    }

    async fn runtime_with_ready_server() -> PolishRuntime {
        let runtime = PolishRuntime::new(PolishRuntimeConfig {
            server_path: PathBuf::new(),
            working_directory: PathBuf::new(),
            model_path: PathBuf::new(),
            server_record: PathBuf::new(),
            server_log: PathBuf::new(),
        });
        serve(&runtime, idle_server()).await;
        runtime
    }

    async fn server_state(runtime: &PolishRuntime) -> ServerState {
        runtime.process.lock().await.state
    }

    async fn fail_request(
        runtime: &PolishRuntime,
        failure: fn() -> anyhow::Error,
    ) -> anyhow::Error {
        runtime
            .run_with_restart(move || async move { Err::<(), _>(failure()) })
            .await
            .unwrap_err()
    }

    fn rejected_request() -> anyhow::Error {
        anyhow::anyhow!("Polish server returned HTTP 400 Bad Request")
    }

    fn empty_answer() -> anyhow::Error {
        parse_chat_response(r#"{"choices":[]}"#).unwrap_err()
    }

    fn dropped_connection() -> anyhow::Error {
        anyhow::Error::new(io::Error::from(io::ErrorKind::ConnectionReset))
            .context(ConnectionFailure("Polish correction response failed"))
    }

    fn closed_loopback_port() -> u16 {
        TcpListener::bind(("127.0.0.1", 0))
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }

    #[tokio::test]
    async fn failed_requests_leave_a_healthy_server_ready_for_the_next_one() {
        let runtime = runtime_with_ready_server().await;

        let rejected = fail_request(&runtime, rejected_request).await;
        let empty = fail_request(&runtime, empty_answer).await;

        assert_eq!(
            rejected.to_string(),
            "Polish server returned HTTP 400 Bad Request"
        );
        assert_eq!(empty.to_string(), "Polish server returned no text");
        assert_eq!(server_state(&runtime).await, ServerState::Ready);
    }

    #[tokio::test]
    async fn a_request_that_times_out_leaves_the_server_running() {
        let runtime = runtime_with_ready_server().await;

        let error = runtime
            .run_with_restart(|| {
                await_local_operation(pending::<Result<()>>(), Duration::ZERO, "Polish request")
            })
            .await
            .unwrap_err();

        assert_eq!(error.to_string(), "Polish request timed out");
        assert_eq!(server_state(&runtime).await, ServerState::Ready);
    }

    #[tokio::test]
    async fn a_dropped_connection_restarts_the_server_once_then_disables_it() {
        let runtime = runtime_with_ready_server().await;

        fail_request(&runtime, dropped_connection).await;
        let after_first_crash = server_state(&runtime).await;
        serve(&runtime, idle_server()).await;
        fail_request(&runtime, dropped_connection).await;

        assert_eq!(after_first_crash, ServerState::Starting);
        assert_eq!(server_state(&runtime).await, ServerState::Disabled);
    }

    #[tokio::test]
    async fn a_crash_after_a_successful_request_is_restarted_again() {
        let runtime = runtime_with_ready_server().await;
        fail_request(&runtime, dropped_connection).await;
        serve(&runtime, idle_server()).await;

        runtime
            .run_with_restart(|| async { Ok::<(), anyhow::Error>(()) })
            .await
            .unwrap();
        fail_request(&runtime, dropped_connection).await;

        assert_eq!(server_state(&runtime).await, ServerState::Starting);
    }

    #[tokio::test]
    async fn a_bad_answer_from_a_server_that_exited_is_treated_as_a_crash() {
        let runtime = runtime_with_ready_server().await;
        let mut exited_server = idle_server();
        exited_server.kill().await.unwrap();
        serve(&runtime, exited_server).await;

        fail_request(&runtime, rejected_request).await;

        assert_eq!(server_state(&runtime).await, ServerState::Starting);
    }

    #[tokio::test]
    async fn a_server_that_stopped_listening_is_restarted() {
        let runtime = runtime_with_ready_server().await;
        runtime.process.lock().await.port = closed_loopback_port();

        runtime.chat("Echo", &[], &|_| {}).await.unwrap_err();

        assert_eq!(server_state(&runtime).await, ServerState::Starting);
    }
}
