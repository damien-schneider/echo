use anyhow::{Context, Result};
use serde::Serialize;
use std::sync::{MutexGuard, PoisonError};
use tauri::Emitter;

use crate::managers::model::{
    resumable_partial_mb, LanguageSupport, PolishModelSpec, POLISH_MODELS, POLISH_MODEL_ID,
};
use crate::settings;

use super::super::runtime::PolishRuntimeConfig;
use super::super::{PolishFailureStage, PolishState, PolishStatus};
use super::model_failure::{failed_at, LanguageModelFailure};
use super::runtime_slot::RuntimeSwap;
use super::{polish_runtime_config, PolishManager, PolishRuntime};

#[derive(Clone, Copy, Serialize)]
pub(crate) struct PolishModelDescriptor {
    pub(super) id: &'static str,
    pub(super) name: &'static str,
    download_size_mb: u64,
    pub(super) supports_thinking: bool,
    pub(super) supports_voice_commands: bool,
}

impl From<&PolishModelSpec> for PolishModelDescriptor {
    fn from(spec: &PolishModelSpec) -> Self {
        Self {
            id: spec.id,
            name: spec.name,
            download_size_mb: spec.download_size_mb(),
            supports_thinking: spec.supports_thinking,
            supports_voice_commands: spec.supports_voice_commands,
        }
    }
}

#[derive(Clone, Serialize)]
pub(crate) struct PolishStatusSnapshot {
    pub(super) model: PolishModelDescriptor,
    #[serde(flatten)]
    pub(super) status: PolishStatus,
}

#[derive(Serialize)]
struct PolishModelRow {
    #[serde(flatten)]
    model: PolishModelDescriptor,
    description: &'static str,
    languages: LanguageSupport,
    memory_mb: Option<u64>,
    is_active: bool,
    is_downloaded: bool,
    is_downloading: bool,
    partial_download_mb: Option<u64>,
}

#[derive(Serialize)]
pub(crate) struct PolishModelCatalog {
    models: Vec<PolishModelRow>,
    selecting_model_id: Option<&'static str>,
}

pub(super) struct PolishModelOperation<'a> {
    manager: &'a PolishManager,
    pub(super) id: &'static str,
}

impl Drop for PolishModelOperation<'_> {
    fn drop(&mut self) {
        *self.manager.model_operation() = None;
        self.manager.emit_models_changed();
    }
}

pub(super) fn polish_model(id: &str) -> Option<&'static PolishModelSpec> {
    POLISH_MODELS.iter().find(|model| model.id == id)
}

pub(super) fn selected_polish_model(stored_id: Option<&str>) -> &'static PolishModelSpec {
    stored_id.and_then(polish_model).unwrap_or_else(|| {
        polish_model(POLISH_MODEL_ID).expect("Qwen is the default language model")
    })
}

impl PolishManager {
    pub(super) fn model_catalog(&self) -> Result<PolishModelCatalog> {
        let selecting_model_id = *self.model_operation();
        let active_id = self.active_model().id;
        let models = POLISH_MODELS
            .iter()
            .map(|spec| {
                let artifact = self
                    .models
                    .get_model_info(spec.id)
                    .with_context(|| format!("{} is missing from the model catalog", spec.name))?;
                Ok(PolishModelRow {
                    model: spec.into(),
                    description: spec.description,
                    languages: spec.languages,
                    memory_mb: spec.memory_mb,
                    is_active: spec.id == active_id,
                    is_downloaded: artifact.is_downloaded,
                    is_downloading: artifact.is_downloading,
                    partial_download_mb: resumable_partial_mb(&artifact),
                })
            })
            .collect::<Result<_>>()?;
        Ok(PolishModelCatalog {
            models,
            selecting_model_id,
        })
    }

    fn model_operation(&self) -> MutexGuard<'_, Option<&'static str>> {
        self.model_operation
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }
    pub(super) fn begin_model_operation(
        &self,
        id: Option<&'static str>,
    ) -> Result<PolishModelOperation<'_>> {
        let mut operation = self.model_operation();
        if operation.is_some() {
            anyhow::bail!("Wait for the current language model operation to finish.");
        }
        let id = id.unwrap_or_else(|| self.active_model().id);
        *operation = Some(id);
        drop(operation);
        self.emit_models_changed();
        Ok(PolishModelOperation { manager: self, id })
    }

    fn emit_models_changed(&self) {
        let _ = self.app.emit("polish-models-changed", ());
    }

    pub(super) async fn verify_model(&self, id: &'static str) -> Result<()> {
        let models = self.models.clone();
        tokio::task::spawn_blocking(move || models.verify_downloaded_model(id))
            .await
            .context("Model verification was interrupted")?
    }

    pub(super) async fn select_model(&self, id: &str) -> Result<()> {
        let model = polish_model(id).context("Unknown language model")?;
        let _operation = self.begin_model_operation(Some(model.id))?;
        if self.active_model().id == model.id {
            return self.prepare_selection(model.id).await;
        }
        self.require_runtime()
            .map_err(|error| failed_at(PolishFailureStage::Runtime, error))?;
        self.models
            .download_model(model.id)
            .await
            .map_err(|error| failed_at(PolishFailureStage::Download, error))?;
        self.activate_model(model).await
    }

    async fn activate_model(&self, model: &PolishModelSpec) -> Result<()> {
        let config = polish_runtime_config(&self.app, &self.models, model.id)?;
        let _preparation = self.preparation.lock().await;
        let active = self.runtime.exclusive().await?;
        let previous = self.status_snapshot();
        let switched = self
            .switch_runtime(active, previous.model, model, config)
            .await;
        if switched.is_err() {
            self.publish_status(previous.model, previous.status);
        }
        switched
    }

    async fn switch_runtime(
        &self,
        active: RuntimeSwap<'_, PolishRuntime>,
        previous: PolishModelDescriptor,
        model: &PolishModelSpec,
        config: PolishRuntimeConfig,
    ) -> Result<()> {
        active
            .reset()
            .await
            .context("Restart Echo to switch language models.")?;
        self.publish_status(
            previous,
            PolishStatus {
                state: PolishState::Loading,
                message: "Switching language model".to_string(),
            },
        );
        let candidate = PolishRuntime::new(config);
        active
            .unless_closed(async {
                candidate
                    .ensure_ready()
                    .await
                    .context(LanguageModelFailure::Switch)
            })
            .await?;
        active.replace(candidate)?;
        settings::update_settings(&self.app, |settings| {
            settings.polish_model_id = Some(model.id.to_string());
        });
        self.publish_status(
            model.into(),
            PolishStatus {
                state: PolishState::Ready,
                message: "Polish is ready".to_string(),
            },
        );
        Ok(())
    }
}
