use crate::managers::diarization::DIARIZATION_MODEL_ID;
use crate::managers::model::ModelManager;
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
pub fn change_meeting_system_audio_device_setting(
    app: AppHandle,
    device: Option<String>,
) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.meeting_system_audio_device = device;
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

/// Polled by the frontend to gate "Start meeting" until the model is on disk.
#[tauri::command]
pub fn get_diarization_status(app: AppHandle) -> Result<DiarizationStatus, String> {
    let model_manager = app.state::<Arc<ModelManager>>();
    let model = model_manager.get_model_info(DIARIZATION_MODEL_ID);

    Ok(DiarizationStatus {
        downloaded: model.as_ref().map(|m| m.is_downloaded).unwrap_or(false),
        downloading: model.as_ref().map(|m| m.is_downloading).unwrap_or(false),
    })
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

#[derive(serde::Serialize)]
pub struct DiarizationStatus {
    pub downloaded: bool,
    pub downloading: bool,
}
