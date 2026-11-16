use anyhow::{Context, Result};
use std::fmt;
use std::future::Future;
use std::io;
use std::time::Duration;
use tokio::process::Child;
use tokio::time::Instant;

const TERMINATION_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ServerState {
    Stopped,
    Starting,
    Ready,
    Disabled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ServerEvent {
    Start,
    BecameReady,
    Crashed,
}

pub(super) fn transition(
    state: ServerState,
    event: ServerEvent,
    restart_count: usize,
) -> ServerState {
    match (state, event) {
        (ServerState::Stopped, ServerEvent::Start) => ServerState::Starting,
        (ServerState::Starting, ServerEvent::BecameReady) => ServerState::Ready,
        (ServerState::Ready, ServerEvent::Crashed) if restart_count == 0 => ServerState::Starting,
        (ServerState::Ready, ServerEvent::Crashed) => ServerState::Disabled,
        _ => state,
    }
}

/// Marks a failure of the connection itself; an answer the server gave is never one.
#[derive(Debug)]
pub(super) struct ConnectionFailure(pub(super) &'static str);

impl fmt::Display for ConnectionFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.0)
    }
}

pub(super) fn is_connection_failure(error: &anyhow::Error) -> bool {
    error.downcast_ref::<ConnectionFailure>().is_some()
}

pub(super) struct RuntimeProcess {
    pub(super) child: Option<Child>,
    pub(super) port: u16,
    pub(super) api_key: String,
    pub(super) state: ServerState,
    pub(super) restart_count: usize,
    /// Counted from the spawn, so a start resumed by a later caller gets no fresh minute.
    pub(super) startup_deadline: Instant,
}

impl Default for RuntimeProcess {
    fn default() -> Self {
        Self {
            child: None,
            port: 0,
            api_key: String::new(),
            state: ServerState::Stopped,
            restart_count: 0,
            startup_deadline: Instant::now(),
        }
    }
}

impl RuntimeProcess {
    pub(super) async fn terminate(&mut self) -> Result<()> {
        terminate_child(&mut self.child, &mut self.state).await
    }

    pub(super) fn record_crash(&mut self) {
        self.state = transition(self.state, ServerEvent::Crashed, self.restart_count);
        self.restart_count += 1;
    }

    /// A caller dropped mid-startup leaves its child behind; the next caller adopts it.
    pub(super) fn has_unfinished_start(&self) -> bool {
        self.state == ServerState::Starting && self.child.is_some()
    }
}

async fn terminate_child(child: &mut Option<Child>, state: &mut ServerState) -> Result<()> {
    let Some(running_child) = child.as_mut() else {
        return Ok(());
    };
    let result = await_termination(running_child.kill(), TERMINATION_TIMEOUT).await;
    apply_termination_result(child, state, result)
}

fn apply_termination_result<T>(
    child: &mut Option<T>,
    state: &mut ServerState,
    result: Result<()>,
) -> Result<()> {
    match result {
        Ok(()) => {
            *child = None;
            Ok(())
        }
        Err(error) => {
            *state = ServerState::Disabled;
            Err(error)
        }
    }
}

async fn await_termination<F>(termination: F, timeout: Duration) -> Result<()>
where
    F: Future<Output = io::Result<()>>,
{
    tokio::time::timeout(timeout, termination)
        .await
        .context("Timed out waiting for local Polish runtime to stop")?
        .context("Failed to stop local Polish runtime")
}

pub(super) async fn await_local_operation<T, F>(
    operation: F,
    timeout: Duration,
    operation_name: &'static str,
) -> Result<T>
where
    F: Future<Output = Result<T>>,
{
    tokio::time::timeout(timeout, operation)
        .await
        .with_context(|| format!("{operation_name} timed out"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::future::pending;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    #[test]
    fn a_connection_failure_is_recognised_beneath_request_context() {
        let error = anyhow::Error::new(io::Error::from(io::ErrorKind::ConnectionReset))
            .context(ConnectionFailure("Echo chat stream failed"))
            .context("Echo chat request failed");

        assert!(is_connection_failure(&error));
    }

    #[tokio::test]
    async fn a_request_that_timed_out_is_not_a_connection_failure() {
        let error = await_local_operation(pending::<Result<()>>(), Duration::ZERO, "Echo chat")
            .await
            .unwrap_err();

        assert!(!is_connection_failure(&error));
    }

    #[test]
    fn server_starts_becomes_ready_and_restarts_once() {
        assert_eq!(
            transition(ServerState::Stopped, ServerEvent::Start, 0),
            ServerState::Starting
        );
        assert_eq!(
            transition(ServerState::Starting, ServerEvent::BecameReady, 0),
            ServerState::Ready
        );
        assert_eq!(
            transition(ServerState::Ready, ServerEvent::Crashed, 0),
            ServerState::Starting
        );
        assert_eq!(
            transition(ServerState::Ready, ServerEvent::Crashed, 1),
            ServerState::Disabled
        );
    }

    #[tokio::test]
    async fn termination_waits_for_exit_confirmation() {
        let confirmed = Arc::new(AtomicBool::new(false));
        let confirmation = Arc::clone(&confirmed);
        let termination = async move {
            tokio::task::yield_now().await;
            confirmation.store(true, Ordering::Release);
            Ok::<(), io::Error>(())
        };

        await_termination(termination, Duration::from_secs(1))
            .await
            .unwrap();

        assert!(confirmed.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn termination_timeout_is_an_error() {
        let error = await_termination(pending::<io::Result<()>>(), Duration::ZERO)
            .await
            .unwrap_err();

        assert!(error
            .to_string()
            .contains("Timed out waiting for local Polish runtime to stop"));
    }

    #[tokio::test]
    async fn termination_propagates_process_errors() {
        let termination = std::future::ready(Err(io::Error::other("wait failed")));
        let error = await_termination(termination, Duration::from_secs(1))
            .await
            .unwrap_err();

        assert!(format!("{error:#}").contains("wait failed"));
    }

    #[test]
    fn unconfirmed_termination_disables_state_and_retains_child() {
        let mut child = Some("running");
        let mut state = ServerState::Ready;
        let result =
            apply_termination_result(&mut child, &mut state, Err(anyhow::anyhow!("wait failed")));

        assert!(result.is_err());
        assert_eq!(state, ServerState::Disabled);
        assert_eq!(child, Some("running"));
    }

    #[test]
    fn confirmed_termination_clears_child_without_overwriting_state() {
        let mut child = Some("stopped");
        let mut state = ServerState::Starting;

        apply_termination_result(&mut child, &mut state, Ok(())).unwrap();

        assert_eq!(state, ServerState::Starting);
        assert_eq!(child, None);
    }

    #[tokio::test]
    async fn local_request_timeout_is_actionable() {
        let error = await_local_operation(
            pending::<Result<()>>(),
            Duration::ZERO,
            "Polish correction request",
        )
        .await
        .unwrap_err();

        assert_eq!(error.to_string(), "Polish correction request timed out");
    }

    #[tokio::test]
    async fn local_request_preserves_transport_errors() {
        let request = std::future::ready(Err::<(), _>(anyhow::anyhow!("connection closed")));
        let error =
            await_local_operation(request, Duration::from_secs(1), "Polish tokenizer request")
                .await
                .unwrap_err();

        assert!(format!("{error:#}").contains("connection closed"));
    }
}
