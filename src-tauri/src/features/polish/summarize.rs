//! Meeting summaries on the bundled sidecar: same runtime as polish, one completion at a time.

use anyhow::{Context, Result};
use std::sync::Arc;

use super::manager::PolishManager;
use super::runtime::PolishRuntime;
use super::{BundledChatMessage, BundledChatRole};

impl PolishManager {
    /// One completion, no stream: the caller shows the summary when it is whole.
    pub(crate) async fn summarize(&self, system: &str, prompt: &str) -> Result<String> {
        if !self.is_downloaded() {
            anyhow::bail!(
                "Download the local Echo model in Settings → AI to summarize on this machine, \
                 or switch the meeting summary engine to a cloud provider."
            );
        }
        self.prepare()
            .await
            .context("Failed to prepare the local model for summarizing")?;
        let messages = [BundledChatMessage {
            content: prompt.to_owned(),
            role: BundledChatRole::User,
        }];
        self.runtime.chat(system, &messages, &|_| {}).await
    }
}

#[tauri::command]
pub(crate) async fn summarize_text_local(
    manager: tauri::State<'_, Arc<PolishManager>>,
    system: String,
    prompt: String,
) -> Result<String, String> {
    manager
        .summarize(&system, &prompt)
        .await
        .map_err(|error| error.to_string())
}

/// Sized from the sidecar's context window, so the frontend never sends a chunk it would truncate.
#[tauri::command]
pub(crate) fn local_summary_char_budget() -> usize {
    PolishRuntime::input_char_budget()
}
