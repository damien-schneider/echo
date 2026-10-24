//! Post-processing's AI SDK call reaches the bundled sidecar through this command instead of a
//! webview fetch: no browser CORS rule applies, and the per-run key never leaves Rust.

use anyhow::{Context, Result};
use reqwest::header::CONTENT_TYPE;
use reqwest::Client;
use serde::Serialize;
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use super::manager::PolishManager;

/// Frees the single sidecar slot once the paste watchdog has already given up on the answer.
const LOCAL_COMPLETION_TIMEOUT: Duration = Duration::from_secs(30);

static LOCAL_COMPLETION_CLIENT: LazyLock<Client> = LazyLock::new(Client::new);

#[derive(Debug, Serialize)]
pub(crate) struct LocalCompletionResponse {
    status: u16,
    body: String,
}

impl PolishManager {
    async fn forward_chat_completion(&self, body: String) -> Result<LocalCompletionResponse> {
        if !self.is_downloaded() {
            anyhow::bail!(
                "Download the local Echo model in Settings → Models to post-process on this machine, \
                 or switch post-processing to your AI provider."
            );
        }
        self.prepare()
            .await
            .context("Failed to prepare the local model for post-processing")?;
        let (url, api_key) = self.runtime.endpoint_auth("/v1/chat/completions").await?;
        let response = LOCAL_COMPLETION_CLIENT
            .post(url)
            .bearer_auth(api_key)
            .header(CONTENT_TYPE, "application/json")
            .body(body)
            .timeout(LOCAL_COMPLETION_TIMEOUT)
            .send()
            .await
            .context("Local model request failed")?;
        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .context("Local model response failed")?;
        Ok(LocalCompletionResponse { status, body })
    }

    /// Loading the weights while the user still speaks keeps the reload out of the paste delay.
    pub(crate) fn warm_up_for_post_processing(self: &Arc<Self>) {
        if !self.is_downloaded() {
            return;
        }
        let manager = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            if let Err(error) = manager.prepare().await {
                log::warn!("Could not warm the local model for post-processing: {error:#}");
            }
        });
    }
}

#[tauri::command]
pub(crate) async fn forward_local_chat_completion(
    manager: tauri::State<'_, Arc<PolishManager>>,
    body: String,
) -> Result<LocalCompletionResponse, String> {
    manager
        .forward_chat_completion(body)
        .await
        .map_err(|error| format!("{error:#}"))
}
