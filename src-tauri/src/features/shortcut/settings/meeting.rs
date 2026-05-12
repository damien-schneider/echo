//! Meeting settings commands.

use crate::managers::model::ModelManager;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

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

#[tauri::command]
pub fn change_meeting_diarization_setting(
    app: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    enabled: bool,
) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.meeting_diarization_enabled = enabled;
    });

    // Auto-download diarization model when enabling
    if enabled {
        let needs_download = model_manager
            .get_model_info("diarization-sortformer")
            .map(|m| !m.is_downloaded && !m.is_downloading)
            .unwrap_or(false);

        if needs_download {
            let mm = model_manager.inner().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = mm.download_model("diarization-sortformer").await {
                    log::error!("Failed to download diarization model: {}", e);
                }
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_diarization_status(
    app: AppHandle,
) -> Result<DiarizationStatus, String> {
    let model_manager = app.state::<Arc<ModelManager>>();
    let model = model_manager.get_model_info("diarization-sortformer");

    Ok(DiarizationStatus {
        downloaded: model.as_ref().map(|m| m.is_downloaded).unwrap_or(false),
        downloading: model.as_ref().map(|m| m.is_downloading).unwrap_or(false),
    })
}

#[derive(serde::Serialize)]
pub struct DiarizationStatus {
    pub downloaded: bool,
    pub downloading: bool,
}
