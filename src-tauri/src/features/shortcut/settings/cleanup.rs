use tauri::AppHandle;

use crate::settings::{self, DictionaryEntrySetting};

#[tauri::command]
pub fn change_cleanup_enabled_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.cleanup_enabled = enabled;
    });
    Ok(())
}

/// Stored only — the prompt builder does not consume this yet.
#[tauri::command]
pub fn change_cleanup_app_context_enabled_setting(
    app: AppHandle,
    enabled: bool,
) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.cleanup_app_context_enabled = enabled;
    });
    Ok(())
}

/// Full-list replace — the frontend owns the editing UX.
#[tauri::command]
pub fn update_cleanup_dictionary(
    app: AppHandle,
    dictionary: Vec<DictionaryEntrySetting>,
) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.cleanup_dictionary = dictionary;
    });
    Ok(())
}
