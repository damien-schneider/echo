use crate::managers::transcription::TranscriptionManager;
use crate::settings::{self, ModelUnloadTimeout};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn set_model_unload_timeout(app: AppHandle, timeout: ModelUnloadTimeout) {
    settings::update_settings(&app, |s| {
        s.model_unload_timeout = timeout;
    });
}

#[tauri::command]
pub fn get_model_load_status(
    transcription_manager: State<TranscriptionManager>,
) -> Result<serde_json::Value, String> {
    let is_loaded = transcription_manager.is_model_loaded();
    let current_model = transcription_manager.get_current_model();

    Ok(serde_json::json!({
        "is_loaded": is_loaded,
        "current_model": current_model
    }))
}

#[tauri::command]
pub fn unload_model_manually(
    transcription_manager: State<TranscriptionManager>,
) -> Result<(), String> {
    transcription_manager
        .unload_model()
        .map_err(|e| format!("Failed to unload model: {}", e))
}
