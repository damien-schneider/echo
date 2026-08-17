use crate::settings;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use super::model_catalog::{apply_artifact_state, available_model_catalog, ArtifactState};
use super::model_download::receipt;
#[cfg(test)]
pub(super) use super::model_download::verification::verify_file_sha256;
pub use super::transcription_profiles::{
    transcription_profile_id, transcription_profile_statuses, transcription_profiles,
    TranscriptionProfileSpec, TranscriptionProfileStatus,
};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EngineType {
    Whisper,
    Diarization,
    Polish,
}

pub const POLISH_MODEL_ID: &str = "polish-qwen3-4b-instruct-2507";

const SHARED_MODELS_APP_ID: &str = "com.damien-schneider.echo";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: Option<String>,
    pub size_mb: u64,
    pub size_bytes: u64,
    pub sha256: Option<String>,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_size: u64,
    pub is_directory: bool,
    pub engine_type: EngineType,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

pub struct ModelManager {
    pub(super) app_handle: AppHandle,
    pub(super) models_dir: PathBuf,
    pub(super) available_models: Mutex<HashMap<String, ModelInfo>>,
}

impl ModelManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
        let models_dir = shared_models_dir(&app_data_dir);

        if !models_dir.exists() {
            fs::create_dir_all(&models_dir)?;
        }

        let available_models = available_model_catalog();
        let manager = Self {
            app_handle: app_handle.clone(),
            models_dir,
            available_models: Mutex::new(available_models),
        };

        manager.migrate_bundled_models()?;

        manager.update_download_status()?;

        Ok(manager)
    }

    pub fn get_transcription_profile_statuses(&self) -> Vec<TranscriptionProfileStatus> {
        let active_size = settings::get_settings(&self.app_handle).transcription_model_size;
        transcription_profile_statuses(active_size, |id| {
            self.get_model_info(id)
                .map(|model| (model.is_downloaded, model.is_downloading))
                .unwrap_or((false, false))
        })
    }

    pub fn get_model_info(&self, model_id: &str) -> Option<ModelInfo> {
        let models = self.available_models.lock().ok()?;
        models.get(model_id).cloned()
    }

    fn migrate_bundled_models(&self) -> Result<()> {
        let bundled_models = ["ggml-small.bin"]; // Add other bundled models here if any

        for filename in &bundled_models {
            let bundled_path = self.app_handle.path().resolve(
                &format!("resources/models/{}", filename),
                tauri::path::BaseDirectory::Resource,
            );

            if let Ok(bundled_path) = bundled_path {
                if bundled_path.exists() {
                    let user_path = self.models_dir.join(filename);

                    if !user_path.exists() {
                        log::info!("Migrating bundled model {} to user directory", filename);
                        fs::copy(&bundled_path, &user_path)?;
                        log::info!("Successfully migrated {}", filename);
                    }
                }
            }
        }

        Ok(())
    }

    pub(super) fn update_download_status(&self) -> Result<()> {
        let mut models = self
            .available_models
            .lock()
            .map_err(|_| anyhow::anyhow!("Model catalog lock is poisoned"))?;

        for model in models.values_mut() {
            let artifact = self.artifact_state(model);
            apply_artifact_state(model, artifact);
        }

        Ok(())
    }

    fn artifact_state(&self, model: &ModelInfo) -> ArtifactState {
        let model_path = self.models_dir.join(&model.filename);
        let partial_path = self.models_dir.join(format!("{}.partial", &model.filename));
        if model.is_directory {
            self.discard_interrupted_extraction(model);
        }
        ArtifactState {
            is_installed: if model.is_directory {
                model_path.is_dir()
            } else {
                model_path.exists()
            },
            partial_size: partial_path.metadata().map(|file| file.len()).unwrap_or(0),
        }
    }

    fn discard_interrupted_extraction(&self, model: &ModelInfo) {
        let extracting_path = self
            .models_dir
            .join(format!("{}.extracting", &model.filename));
        if extracting_path.exists() {
            log::warn!("Cleaning up interrupted extraction for model: {}", model.id);
            let _ = fs::remove_dir_all(&extracting_path);
        }
    }

    pub fn delete_model(&self, model_id: &str) -> Result<()> {
        log::info!("ModelManager: delete_model called for: {}", model_id);

        let model_info = {
            let models = self
                .available_models
                .lock()
                .map_err(|_| anyhow::anyhow!("Model catalog lock is poisoned"))?;
            models.get(model_id).cloned()
        };

        let model_info =
            model_info.ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        log::debug!("ModelManager: Found model info: {:?}", model_info);

        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));
        log::debug!("ModelManager: Model path: {:?}", model_path);
        log::debug!("ModelManager: Partial path: {:?}", partial_path);

        let mut deleted_something = false;

        if model_info.is_directory {
            if model_path.exists() && model_path.is_dir() {
                log::info!(
                    "ModelManager: Deleting model directory at: {:?}",
                    model_path
                );
                fs::remove_dir_all(&model_path)?;
                log::info!("ModelManager: Model directory deleted successfully");
                deleted_something = true;
            }
        } else {
            if model_path.exists() {
                log::info!("ModelManager: Deleting model file at: {:?}", model_path);
                fs::remove_file(&model_path)?;
                log::info!("ModelManager: Model file deleted successfully");
                deleted_something = true;
            }
        }

        receipt::remove_receipt(&model_path);

        if partial_path.exists() {
            log::info!("ModelManager: Deleting partial file at: {:?}", partial_path);
            fs::remove_file(&partial_path)?;
            log::info!("ModelManager: Partial file deleted successfully");
            deleted_something = true;
        }

        if !deleted_something {
            return Err(anyhow::anyhow!("No model files found to delete"));
        }

        self.update_download_status()?;
        log::debug!("ModelManager: Download status updated");

        Ok(())
    }

    pub fn get_model_path(&self, model_id: &str) -> Result<PathBuf> {
        let model_info = self
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        if !model_info.is_downloaded {
            return Err(anyhow::anyhow!("Model not available: {}", model_id));
        }

        if model_info.is_downloading {
            return Err(anyhow::anyhow!(
                "Model is currently downloading: {}",
                model_id
            ));
        }

        let model_path = self.models_dir.join(&model_info.filename);
        let partial_path = self
            .models_dir
            .join(format!("{}.partial", &model_info.filename));

        if model_info.is_directory {
            if model_path.exists() && model_path.is_dir() && !partial_path.exists() {
                Ok(model_path)
            } else {
                Err(anyhow::anyhow!(
                    "Complete model directory not found: {}",
                    model_id
                ))
            }
        } else {
            if model_path.exists() && !partial_path.exists() {
                Ok(model_path)
            } else {
                Err(anyhow::anyhow!(
                    "Complete model file not found: {}",
                    model_id
                ))
            }
        }
    }

    pub(crate) fn model_file_path(&self, model_id: &str) -> Result<PathBuf> {
        let model = self
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {model_id}"))?;
        Ok(self.models_dir.join(model.filename))
    }
}

fn shared_models_dir(app_data_dir: &std::path::Path) -> PathBuf {
    let data_root = app_data_dir.parent().unwrap_or(app_data_dir);
    data_root.join(SHARED_MODELS_APP_ID).join("models")
}

#[cfg(test)]
include!("model_tests.rs");
