//! TTS-related settings commands.

use crate::settings;
use tauri::AppHandle;

#[tauri::command]
pub fn change_tts_enabled_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.tts_enabled = enabled;
    });
    Ok(())
}
