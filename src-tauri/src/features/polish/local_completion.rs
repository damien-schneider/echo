use anyhow::{Context, Result};
use std::sync::Arc;

use super::manager::PolishManager;

impl PolishManager {
    pub(crate) async fn complete_with_tools(
        &self,
        body: &serde_json::Value,
    ) -> Result<Option<String>> {
        if !self.supports_voice_commands() {
            return Ok(None);
        }
        let runtime = self
            .prepared_runtime()
            .await
            .context("Failed to prepare the local model for voice commands")?;
        if !self.supports_voice_commands() {
            return Ok(None);
        }
        runtime.complete_with_tools(body).await.map(Some)
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
