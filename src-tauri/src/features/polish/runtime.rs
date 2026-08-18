mod idle;
mod process_lifecycle;
mod protocol;
mod server_args;

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use std::future::Future;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::process::Command;
use tokio::sync::Mutex;

use super::policy::build_polish_prompt;
use super::selection::InferencePort;
use super::BundledChatMessage;
pub(in crate::features::polish) use idle::IDLE_CHECK_INTERVAL;
use idle::{should_release_idle_runtime, ActivityTracker};
use process_lifecycle::{
    await_local_operation, transition, RuntimeProcess, ServerEvent, ServerState,
};
use protocol::{
    parse_chat_response, ChatRequest, ChatRequestMessage, ChatStreamDecoder, TokenizeRequest,
    TokenizeResponse,
};
use server_args::{server_arguments, ServerBinding};

const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(100);
const HEALTH_REQUEST_TIMEOUT: Duration = Duration::from_secs(1);
const RUNTIME_STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const POLISH_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CHAT_STREAM_TIMEOUT: Duration = Duration::from_secs(180);
const CHAT_PUBLISH_INTERVAL: Duration = Duration::from_millis(50);
const TOKENIZE_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const POLISH_SYSTEM_PROMPT: &str = "You are a conservative multilingual proofreader. Never translate or rewrite. Keep the input language, meaning, tone, line breaks, names, URLs, emails, identifiers, and code. Fix only clear spelling, grammar, punctuation, agreement, or idiom errors. If the text is already correct, return it byte-for-byte. Output only the final text.";

fn bundled_chat_request_messages<'a>(
    system: &'a str,
    messages: &'a [BundledChatMessage],
) -> Vec<ChatRequestMessage<'a>> {
    let mut request_messages = Vec::with_capacity(messages.len() + 1);
    request_messages.push(ChatRequestMessage {
        role: "system",
        content: system,
    });
    request_messages.extend(messages.iter().map(|message| ChatRequestMessage {
        role: message.role.as_str(),
        content: &message.content,
    }));
    request_messages
}

pub(super) struct PolishRuntimeConfig {
    pub(super) server_path: PathBuf,
    pub(super) working_directory: PathBuf,
    pub(super) model_path: PathBuf,
}

pub(super) struct PolishRuntime {
    config: PolishRuntimeConfig,
    client: Client,
    process: Mutex<RuntimeProcess>,
    shutting_down: AtomicBool,
    activity: ActivityTracker,
}

impl PolishRuntime {
    pub(super) fn new(config: PolishRuntimeConfig) -> Self {
        Self {
            config,
            client: Client::new(),
            process: Mutex::new(RuntimeProcess::default()),
            shutting_down: AtomicBool::new(false),
            activity: ActivityTracker::default(),
        }
    }

    /// Frees the resident weights once the user stops asking; next request pays the reload.
    pub(super) async fn release_if_idle(&self) -> bool {
        if !should_release_idle_runtime(self.activity.snapshot(self.is_loaded().await)) {
            return false;
        }
        let mut process = self.process.lock().await;
        // decided before the lock — a request taken since then reloaded the runtime
        if !should_release_idle_runtime(self.activity.snapshot(process.state == ServerState::Ready))
        {
            return false;
        }
        if let Err(error) = process.terminate().await {
            log::warn!("Could not release the idle Polish runtime: {error:#}");
            return false;
        }
        // voluntary stop, not a crash — restart budget starts over
        *process = RuntimeProcess::default();
        log::info!("Released the idle Polish model");
        true
    }

    async fn is_loaded(&self) -> bool {
        self.process.lock().await.state == ServerState::Ready
    }

    pub(super) async fn ensure_ready(&self) -> Result<()> {
        self.activity.touch();
        self.ensure_running()?;
        let mut process = self.process.lock().await;
        self.ensure_running()?;
        self.refresh_process_state(&mut process)?;
        if process.state == ServerState::Ready {
            return Ok(());
        }
        if process.state == ServerState::Disabled {
            bail!("Polish runtime disabled after repeated crashes");
        }
        self.spawn_server(&mut process)?;
        self.wait_until_ready(&mut process).await
    }

    pub(super) async fn shutdown(&self) -> Result<()> {
        self.shutting_down.store(true, Ordering::Release);
        let mut process = self.process.lock().await;
        process.terminate().await?;
        process.state = ServerState::Stopped;
        Ok(())
    }

    pub(super) async fn reset(&self) -> Result<()> {
        let mut process = self.process.lock().await;
        process.terminate().await?;
        *process = RuntimeProcess::default();
        Ok(())
    }

    pub(super) async fn requires_repair(&self) -> bool {
        self.process.lock().await.state != ServerState::Ready
    }

    fn refresh_process_state(&self, process: &mut RuntimeProcess) -> Result<()> {
        if process.state != ServerState::Ready {
            return Ok(());
        }
        let exited = match process.child.as_mut() {
            Some(child) => child.try_wait()?.is_some(),
            None => true,
        };
        if exited {
            process.child = None;
            process.state = transition(process.state, ServerEvent::Crashed, process.restart_count);
            process.restart_count += 1;
        }
        Ok(())
    }

    fn spawn_server(&self, process: &mut RuntimeProcess) -> Result<()> {
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
        process.state = transition(ServerState::Stopped, ServerEvent::Start, 0);
        Ok(())
    }

    async fn wait_until_ready(&self, process: &mut RuntimeProcess) -> Result<()> {
        let readiness =
            tokio::time::timeout(RUNTIME_STARTUP_TIMEOUT, self.poll_until_ready(process)).await;
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

    async fn endpoint_auth(&self, endpoint: &str) -> Result<(String, String)> {
        self.activity.touch();
        self.ensure_ready().await?;
        let process = self.process.lock().await;
        self.ensure_running()?;
        Ok((
            format!("http://127.0.0.1:{}{endpoint}", process.port),
            process.api_key.clone(),
        ))
    }

    async fn request_polish(&self, text: &str) -> Result<String> {
        let prompt = build_polish_prompt(text);
        let messages = [
            ChatRequestMessage {
                role: "system",
                content: POLISH_SYSTEM_PROMPT,
            },
            ChatRequestMessage {
                role: "user",
                content: &prompt,
            },
        ];
        self.run_with_restart(|| self.send_polish_request(&messages))
            .await
    }

    async fn post_chat(
        &self,
        messages: &[ChatRequestMessage<'_>],
        temperature: f32,
        stream: bool,
    ) -> Result<reqwest::Response> {
        let (url, api_key) = self.endpoint_auth("/v1/chat/completions").await?;
        let response = self
            .client
            .post(url)
            .bearer_auth(api_key)
            .json(&ChatRequest {
                model: "polish",
                messages,
                stream,
                temperature,
                seed: 0,
                max_tokens: 2_048,
            })
            .send()
            .await?;
        let status = response.status();
        if !status.is_success() {
            bail!("Polish server returned HTTP {status}");
        }
        Ok(response)
    }

    async fn send_polish_request(&self, messages: &[ChatRequestMessage<'_>]) -> Result<String> {
        let operation = async {
            let body = self
                .post_chat(messages, 0.0, false)
                .await
                .context("Polish correction request failed")?
                .text()
                .await
                .context("Polish correction response failed")?;
            parse_chat_response(&body)
        };
        await_local_operation(
            operation,
            POLISH_REQUEST_TIMEOUT,
            "Polish correction request",
        )
        .await
    }

    pub(super) async fn chat(
        &self,
        system: &str,
        messages: &[BundledChatMessage],
        publish: &(dyn Fn(&str) + Send + Sync),
    ) -> Result<String> {
        let _request = self.activity.begin_request();
        let request_messages = bundled_chat_request_messages(system, messages);
        self.run_with_restart(|| self.stream_chat_request(&request_messages, publish))
            .await
    }

    /// Publishes the answer so far, so a restarted attempt overwrites what the first one showed.
    async fn stream_chat_request(
        &self,
        messages: &[ChatRequestMessage<'_>],
        publish: &(dyn Fn(&str) + Send + Sync),
    ) -> Result<String> {
        let operation = async {
            let response = self
                .post_chat(messages, 0.2, true)
                .await
                .context("Echo chat request failed")?;
            publish("");
            let mut chunks = response.bytes_stream();
            let mut decoder = ChatStreamDecoder::default();
            let mut answer = String::new();
            let mut published = Instant::now();
            while let Some(chunk) = chunks.next().await {
                let chunk = chunk.context("Echo chat stream failed")?;
                answer.push_str(&decoder.push(&chunk)?);
                if published.elapsed() >= CHAT_PUBLISH_INTERVAL {
                    published = Instant::now();
                    publish(answer.trim());
                }
            }
            let answer = answer.trim();
            if answer.is_empty() {
                bail!("Polish server returned no text");
            }
            Ok(answer.to_owned())
        };
        await_local_operation(operation, CHAT_STREAM_TIMEOUT, "Echo chat request").await
    }

    async fn mark_crashed(&self) -> Result<()> {
        let mut process = self.process.lock().await;
        if process.state != ServerState::Ready {
            return Ok(());
        }
        process.terminate().await?;
        process.state = transition(process.state, ServerEvent::Crashed, process.restart_count);
        process.restart_count += 1;
        Ok(())
    }

    async fn run_with_restart<T, Operation, OperationFuture>(
        &self,
        mut operation: Operation,
    ) -> Result<T>
    where
        Operation: FnMut() -> OperationFuture,
        OperationFuture: Future<Output = Result<T>>,
    {
        let first_error = match operation().await {
            Ok(output) => return Ok(output),
            Err(error) => error,
        };
        self.ensure_running()?;
        self.mark_crashed()
            .await
            .with_context(|| format!("Failed to stop Polish runtime after: {first_error}"))?;
        self.ensure_ready()
            .await
            .with_context(|| format!("Polish runtime did not recover after: {first_error}"))?;
        let second_error = match operation().await {
            Ok(output) => return Ok(output),
            Err(error) => error,
        };
        self.mark_crashed()
            .await
            .context("Failed to stop Polish runtime after retry")?;
        Err(second_error).context("Polish runtime failed after one restart")
    }

    fn ensure_running(&self) -> Result<()> {
        if self.shutting_down.load(Ordering::Acquire) {
            bail!("Polish runtime is shutting down");
        }
        Ok(())
    }

    async fn send_token_count(&self, text: &str) -> Result<usize> {
        let (url, api_key) = self.endpoint_auth("/tokenize").await?;
        let operation = async {
            let response = self
                .client
                .post(url)
                .bearer_auth(api_key)
                .json(&TokenizeRequest {
                    content: text,
                    add_special: false,
                })
                .send()
                .await
                .context("Polish tokenizer request failed")?
                .error_for_status()?;
            let body: TokenizeResponse = response
                .json()
                .await
                .context("Polish tokenizer returned malformed JSON")?;
            Ok(body.tokens.len())
        };
        await_local_operation(
            operation,
            TOKENIZE_REQUEST_TIMEOUT,
            "Polish tokenizer request",
        )
        .await
    }
}

#[async_trait]
impl InferencePort for PolishRuntime {
    async fn token_count(&self, text: &str) -> Result<usize> {
        let _request = self.activity.begin_request();
        self.run_with_restart(|| self.send_token_count(text)).await
    }

    async fn polish(&self, text: &str) -> Result<String> {
        let _request = self.activity.begin_request();
        self.request_polish(text).await
    }
}

impl Drop for PolishRuntime {
    fn drop(&mut self) {
        self.shutting_down.store(true, Ordering::Release);
        if let Ok(mut process) = self.process.try_lock() {
            if let Some(child) = process.child.as_mut() {
                let _ = child.start_kill();
            }
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

#[cfg(test)]
#[path = "runtime_tests.rs"]
mod tests;
