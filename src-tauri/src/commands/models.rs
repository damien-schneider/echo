use crate::features::polish::manager::PolishManager;
use crate::managers::meeting::MeetingManager;
use crate::managers::model::{
    transcription_profile_id, ModelManager, TranscriptionProfileStatus, POLISH_MODEL_ID,
    POLISH_MODEL_MEMORY_MB, POLISH_MODEL_NAME,
};
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{self, TranscriptionModelSize};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize)]
pub struct ModelFootprint {
    download_size_mb: u64,
    memory_mb: u64,
}

#[tauri::command]
pub async fn get_transcription_profiles(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<Vec<TranscriptionProfileStatus>, String> {
    Ok(model_manager.get_transcription_profile_statuses())
}

#[tauri::command]
pub async fn get_polish_model_footprint(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<ModelFootprint, String> {
    let model = model_manager
        .get_model_info(POLISH_MODEL_ID)
        .ok_or_else(|| format!("{POLISH_MODEL_NAME} is missing from the model catalog"))?;
    Ok(ModelFootprint {
        download_size_mb: model.size_mb,
        memory_mb: POLISH_MODEL_MEMORY_MB,
    })
}

/// What the notch offers when a dictation is blocked: the model Settings already picked, no
/// settings page to find first.
#[tauri::command]
pub async fn download_configured_transcription_model(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<(), String> {
    let size = settings::get_settings(&app_handle).transcription_model_size;
    select_transcription_model_size(
        app_handle.clone(),
        model_manager,
        transcription_manager,
        size,
    )
    .await
}

#[tauri::command]
pub async fn select_transcription_model_size(
    app_handle: AppHandle,
    model_manager: State<'_, Arc<ModelManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    size: TranscriptionModelSize,
) -> Result<(), String> {
    let model_id = transcription_profile_id(size);
    let model = model_manager
        .get_model_info(model_id)
        .ok_or_else(|| format!("Transcription profile not found: {model_id}"))?;

    if !model.is_downloaded {
        model_manager
            .download_model(model_id)
            .await
            .map_err(|error| error.to_string())?;
    }

    let previous_size = settings::get_settings(&app_handle).transcription_model_size;
    settings::update_settings(&app_handle, |current| {
        current.transcription_model_size = size;
    });
    if let Err(error) = transcription_manager.load_model(model_id) {
        settings::update_settings(&app_handle, |current| {
            current.transcription_model_size = previous_size;
        });
        return Err(error.to_string());
    }

    Ok(())
}

/// A model still in memory keeps answering from a file that is gone; unload it first. A meeting
/// reaches for every model when it ends, so none may go while one runs.
#[tauri::command]
pub(crate) async fn delete_model(
    model_manager: State<'_, Arc<ModelManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    polish_manager: State<'_, Arc<PolishManager>>,
    meeting_manager: State<'_, Arc<MeetingManager>>,
    model_id: String,
) -> Result<(), String> {
    if meeting_manager.get_active_meeting().is_some() {
        return Err("Stop the meeting before deleting a model".to_string());
    }
    if model_id == POLISH_MODEL_ID {
        return polish_manager
            .delete_model()
            .await
            .map_err(|error| format!("{error:#}"));
    }
    transcription_manager.unload_model(&model_id);
    model_manager
        .delete_model(&model_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn reveal_model_file(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    let path = model_manager
        .on_disk_path(&model_id)
        .map_err(|error| error.to_string())?;
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_legacy_model_files_mb(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<Option<u64>, String> {
    Ok(model_manager.legacy_model_files_mb())
}

#[tauri::command]
pub async fn reveal_legacy_model_files(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<(), String> {
    tauri_plugin_opener::reveal_items_in_dir(model_manager.legacy_model_files())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_legacy_model_files(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<(), String> {
    model_manager
        .delete_legacy_model_files()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_transcription_model_status(
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<Option<String>, String> {
    Ok(transcription_manager.get_current_model())
}

#[tauri::command]
pub async fn has_any_models_available(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<bool, String> {
    Ok(model_manager
        .get_transcription_profile_statuses()
        .iter()
        .any(|profile| profile.is_downloaded))
}
