use super::load_failure::{load_failure_cause, load_failure_message};
use super::usage::{HeldUse, ModelUseGuard};
use super::{requires_model_load, try_acquire_once_flag, ModelStateEvent, TranscriptionManager};
use crate::managers::model::{transcription_profile_id, EngineType};
use crate::settings::get_settings;
use anyhow::Result;
use log::{debug, error, info};
use std::thread;
use tauri::Emitter;

const MODEL_NOT_LOADED: &str = "Model is not loaded for transcription.";

impl TranscriptionManager {
    fn load_runtime_model(&self, model_id: &str) -> Result<()> {
        let model_info = self
            .model_manager
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;
        if !model_info.is_downloaded {
            return Err(anyhow::anyhow!("Model not downloaded"));
        }
        let model_path = self.model_manager.get_model_path(model_id)?;
        match model_info.engine_type {
            EngineType::Whisper => self.engine.load(model_id, &model_path),
            EngineType::Diarization => Err(anyhow::anyhow!(
                "Diarization models cannot be used for transcription"
            )),
            EngineType::Polish => Err(anyhow::anyhow!(
                "Polish models cannot be used for transcription"
            )),
            EngineType::MeetingTranscription => Err(anyhow::anyhow!(
                "Meeting transcription models cannot be used for dictation"
            )),
        }
    }

    pub fn load_model(&self, model_id: &str) -> Result<()> {
        let current_model_id = self.engine.current_model_id();
        if !requires_model_load(current_model_id.as_deref(), model_id) {
            return Ok(());
        }
        let _loading = self.usage.begin(HeldUse::loading(model_id));
        let load_start = std::time::Instant::now();
        debug!("Starting to load model: {}", model_id);

        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_started".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: None,
                error: None,
            },
        );

        if let Err(error) = self.load_runtime_model(model_id) {
            return Err(self.record_load_failure(model_id, error));
        }
        self.usage.lock().load_failure = None;

        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_completed".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: self.model_manager.get_model_info(model_id).map(|m| m.name),
                error: None,
            },
        );

        debug!(
            "Successfully loaded transcription model: {} (took {}ms)",
            model_id,
            load_start.elapsed().as_millis()
        );
        Ok(())
    }

    /// Kept for the dictation that follows: it finds no model to decode with and has to say why.
    fn record_load_failure(&self, model_id: &str, error: anyhow::Error) -> anyhow::Error {
        let model_name = self.model_manager.get_model_info(model_id).map(|m| m.name);
        let file_is_installed = self.model_manager.get_model_path(model_id).is_ok();
        let message = load_failure_message(
            model_name.as_deref().unwrap_or(model_id),
            &load_failure_cause(&error, file_is_installed),
        );
        self.usage.lock().load_failure = Some(message.clone());
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_failed".to_string(),
                model_id: Some(model_id.to_string()),
                model_name,
                error: Some(message.clone()),
            },
        );
        error.context(message)
    }

    fn unload_model(&self, model_id: &str) {
        if !self.engine.unload(model_id) {
            return;
        }
        info!("Unloaded transcription model: {model_id}");
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "unloaded".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: None,
                error: None,
            },
        );
    }

    /// Loads and decodes register under this lock, so none can start on a file that is going away.
    pub(crate) fn delete_model(&self, model_id: &str) -> Result<()> {
        let mut usage = self.usage.lock();
        if let Some(refusal) = usage.deletion_refusal(model_id) {
            anyhow::bail!(refusal);
        }
        self.unload_model(model_id);
        usage.load_failure = None;
        self.model_manager.delete_model(model_id)
    }

    /// Idempotent.
    pub fn load_streaming_model(&self, model_id: &str) -> Result<()> {
        self.load_model(model_id)
    }

    pub fn is_streaming_loaded_with_id(&self, target_id: &str) -> bool {
        self.engine.current_model_id().as_deref() == Some(target_id)
    }

    /// Idempotent. No warmup decode — holding `engine.lock` would starve the stop-flow transcribe.
    pub fn prewarm(&self) -> Result<()> {
        let Some(_guard) = try_acquire_once_flag(&self.prewarm_in_progress) else {
            debug!("prewarm: skipped — another prewarm is already running");
            return Ok(());
        };

        let settings = get_settings(&self.app_handle);
        let model_id = transcription_profile_id(settings.transcription_model_size);
        if !self.is_streaming_loaded_with_id(model_id) {
            self.load_model(model_id)?;
        }
        Ok(())
    }

    pub fn initiate_model_load(&self) {
        let mut usage = self.usage.lock();
        if usage.is_loading() || self.is_model_loaded() {
            return;
        }
        let settings = get_settings(&self.app_handle);
        let model_id = transcription_profile_id(settings.transcription_model_size);
        let loading = self
            .usage
            .begin_locked(&mut usage, HeldUse::loading(model_id));
        drop(usage);

        let self_clone = self.clone();
        thread::spawn(move || {
            let _loading = loading;
            if let Err(e) = self_clone.load_model(model_id) {
                error!("Failed to load model: {e:#}");
            }
        });
    }

    /// Waits out a load in flight, then counts the decode against the loaded model until it ends.
    pub(super) fn begin_decode(&self) -> Result<ModelUseGuard> {
        let mut usage = self.usage.lock();
        loop {
            if let Some(model_id) = self.engine.current_model_id() {
                return Ok(self
                    .usage
                    .begin_locked(&mut usage, HeldUse::transcribing(&model_id)));
            }
            if !usage.is_loading() {
                anyhow::bail!(usage
                    .load_failure
                    .clone()
                    .unwrap_or_else(|| MODEL_NOT_LOADED.to_string()));
            }
            usage = self.usage.wait_for_change(usage);
        }
    }
}
