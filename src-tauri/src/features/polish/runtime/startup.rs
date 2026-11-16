use anyhow::{bail, Context, Result};
use std::net::TcpListener;
use std::process::Stdio;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::{timeout_at, Instant};

use super::process_lifecycle::{
    await_local_operation, transition, RuntimeProcess, ServerEvent, ServerState,
};
use super::server_args::{server_arguments, ServerBinding};
use super::PolishRuntime;

const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(100);
const HEALTH_REQUEST_TIMEOUT: Duration = Duration::from_secs(1);
const RUNTIME_STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

impl PolishRuntime {
    pub(super) fn spawn_server(&self, process: &mut RuntimeProcess) -> Result<()> {
        self.ensure_running()?;
        if process.child.is_some() {
            bail!("Polish runtime shutdown is incomplete");
        }
        let port = available_loopback_port()?;
        let api_key = random_api_key()?;
        let mut command = Command::new(&self.config.server_path);
        command
            .current_dir(&self.config.working_directory)
            .args(server_arguments(ServerBinding {
                model_path: self.config.model_path.to_string_lossy().as_ref(),
                port,
                api_key: &api_key,
            }))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let child = command.spawn().with_context(|| {
            format!(
                "Failed to start local Polish runtime at {}",
                self.config.server_path.display()
            )
        })?;
        process.child = Some(child);
        process.port = port;
        process.api_key = api_key;
        process.startup_deadline = Instant::now() + RUNTIME_STARTUP_TIMEOUT;
        process.state = transition(ServerState::Stopped, ServerEvent::Start, 0);
        Ok(())
    }

    pub(super) async fn wait_until_ready(&self, process: &mut RuntimeProcess) -> Result<()> {
        let deadline = process.startup_deadline;
        let readiness = timeout_at(deadline, self.poll_until_ready(process)).await;
        if let Ok(result) = readiness {
            return result;
        }
        process.terminate().await?;
        process.state = ServerState::Stopped;
        bail!("Polish runtime did not become ready within 60 seconds")
    }

    async fn poll_until_ready(&self, process: &mut RuntimeProcess) -> Result<()> {
        let url = format!("http://127.0.0.1:{}/health", process.port);
        loop {
            if self.shutting_down.load(Ordering::Acquire) {
                process.terminate().await?;
                process.state = ServerState::Stopped;
                bail!("Polish runtime is shutting down");
            }
            let exit_status = process
                .child
                .as_mut()
                .map(|child| child.try_wait())
                .transpose()
                .context("Failed to inspect local Polish runtime")?
                .flatten();
            if let Some(exit_status) = exit_status {
                process.child = None;
                process.state = ServerState::Stopped;
                bail!("Polish runtime exited during startup with {exit_status}");
            }
            let request = self.client.get(&url).bearer_auth(&process.api_key);
            let ready = await_local_operation(
                async { request.send().await.context("Polish health request failed") },
                HEALTH_REQUEST_TIMEOUT,
                "Polish health request",
            )
            .await
            .is_ok_and(|response| response.status().is_success());
            if ready {
                process.state = transition(process.state, ServerEvent::BecameReady, 0);
                return Ok(());
            }
            tokio::time::sleep(HEALTH_POLL_INTERVAL).await;
        }
    }
}

fn available_loopback_port() -> Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn random_api_key() -> Result<String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).context("Failed to create Polish server API key")?;
    Ok(bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>())
}
