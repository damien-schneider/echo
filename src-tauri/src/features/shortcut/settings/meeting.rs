use crate::managers::diarization::DIARIZATION_MODEL_ID;
use crate::managers::meeting_voxtral::voxtral_supported;
use crate::managers::model::{resumable_partial_mb, ModelManager, VOXTRAL_MODEL_ID};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::settings;

#[tauri::command]
pub fn change_meeting_system_audio_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.meeting_system_audio_enabled = enabled;
    });
    Ok(())
}

#[tauri::command]
pub fn change_meeting_auto_summary_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.meeting_auto_summary = enabled;
    });
    Ok(())
}

#[tauri::command]
pub fn change_meeting_chunk_duration_setting(
    app: AppHandle,
    duration_secs: u32,
) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.meeting_chunk_duration_secs = duration_secs.max(10);
    });
    Ok(())
}

#[derive(serde::Serialize)]
pub struct ModelArtifactStatus {
    pub downloaded: bool,
    pub downloading: bool,
    pub download_size_mb: u64,
    pub partial_download_mb: Option<u64>,
}

fn artifact_status(app: &AppHandle, model_id: &str) -> Result<ModelArtifactStatus, String> {
    let model = app
        .state::<Arc<ModelManager>>()
        .get_model_info(model_id)
        .ok_or_else(|| format!("{model_id} is missing from the model catalog"))?;
    Ok(ModelArtifactStatus {
        downloaded: model.is_downloaded,
        downloading: model.is_downloading,
        download_size_mb: model.size_mb,
        partial_download_mb: resumable_partial_mb(&model),
    })
}

/// Polled by the frontend to gate "Start meeting" until the model is on disk.
#[tauri::command]
pub fn get_diarization_status(app: AppHandle) -> Result<ModelArtifactStatus, String> {
    artifact_status(&app, DIARIZATION_MODEL_ID)
}

#[tauri::command]
pub async fn download_diarization_model(app: AppHandle) -> Result<(), String> {
    let model_manager = app.state::<Arc<ModelManager>>().inner().clone();
    let needs_download = model_manager
        .get_model_info(DIARIZATION_MODEL_ID)
        .map(|m| !m.is_downloaded && !m.is_downloading)
        .unwrap_or(false);
    if needs_download {
        model_manager
            .download_model(DIARIZATION_MODEL_ID)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_meeting_model_status(app: AppHandle) -> Result<MeetingModelStatus, String> {
    Ok(MeetingModelStatus {
        supported: voxtral_supported(),
        artifact: artifact_status(&app, VOXTRAL_MODEL_ID)?,
    })
}

#[tauri::command]
pub async fn download_meeting_model(app: AppHandle) -> Result<(), String> {
    if !voxtral_supported() {
        return Err("Voxtral needs an Apple Silicon Mac with 16 GB of memory".to_string());
    }
    let model_manager = app.state::<Arc<ModelManager>>().inner().clone();
    let needs_download = model_manager
        .get_model_info(VOXTRAL_MODEL_ID)
        .is_some_and(|m| !m.is_downloaded && !m.is_downloading);
    if needs_download {
        model_manager
            .download_model(VOXTRAL_MODEL_ID)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct MeetingModelStatus {
    pub supported: bool,
    #[serde(flatten)]
    pub artifact: ModelArtifactStatus,
}
