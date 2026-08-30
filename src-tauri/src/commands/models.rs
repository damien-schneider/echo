use crate::managers::model::{transcription_profile_id, ModelManager, TranscriptionProfileStatus};
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{self, TranscriptionModelSize};
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_transcription_profiles(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<Vec<TranscriptionProfileStatus>, String> {
    Ok(model_manager.get_transcription_profile_statuses())
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
    select_transcription_model_size(app_handle.clone(), model_manager, transcription_manager, size)
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

#[tauri::command]
pub async fn delete_model(
    model_manager: State<'_, Arc<ModelManager>>,
    model_id: String,
) -> Result<(), String> {
    model_manager
        .delete_model(&model_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_transcription_model_status(
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<Option<String>, String> {
    Ok(transcription_manager.get_current_model())
}

#[tauri::command]
pub async fn is_model_loading(
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<bool, String> {
    let current_model = transcription_manager.get_current_model();
    Ok(current_model.is_none())
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

#[tauri::command]
pub async fn has_any_models_or_downloads(
    model_manager: State<'_, Arc<ModelManager>>,
) -> Result<bool, String> {
    Ok(model_manager
        .get_transcription_profile_statuses()
        .iter()
        .any(|profile| profile.is_downloaded || profile.is_downloading))
}

#[tauri::command]
pub async fn get_recommended_first_model() -> Result<String, String> {
    Ok(TranscriptionModelSize::default().as_str().to_string())
}
