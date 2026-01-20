use crate::managers::tts::TtsManager;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn preview_tts(state: State<'_, Arc<TtsManager>>, text: String) -> Result<(), String> {
    state.speak(&text).map_err(|e| e.to_string())
}
