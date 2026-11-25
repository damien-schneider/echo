use anyhow::{Context, Result};
use serde::Serialize;
use std::sync::Arc;

use super::manager::PolishManager;
use super::transform::{transform, Framing};
use crate::model_pass::MODEL_PASS_BUDGET;
use crate::settings::get_settings;

#[derive(Debug, Serialize)]
pub(crate) struct DictationRewrite {
    pub(crate) text: String,
    pub(crate) prompt_name: String,
}

impl PolishManager {
    pub(crate) async fn rewrite_dictation(&self, text: &str) -> Result<Option<DictationRewrite>> {
        let Some(prompt) = get_settings(&self.app).dictation_rewrite_prompt() else {
            return Ok(None);
        };
        let runtime = self
            .prepared_runtime()
            .await
            .context("Failed to prepare the local model for the dictation rewrite")?;
        let text = transform(&*runtime, text, &prompt.instruction, Framing::Speech).await?;
        Ok(Some(DictationRewrite {
            text,
            prompt_name: prompt.name,
        }))
    }
}

/// `None` means no dictation prompt is set: the raw transcript is the result.
#[tauri::command]
pub(crate) async fn rewrite_dictation(
    manager: tauri::State<'_, Arc<PolishManager>>,
    text: String,
) -> Result<Option<DictationRewrite>, String> {
    tokio::time::timeout(MODEL_PASS_BUDGET, manager.rewrite_dictation(&text))
        .await
        .map_err(|_| "Dictation rewrite timed out".to_string())?
        .map_err(|error| format!("{error:#}"))
}
