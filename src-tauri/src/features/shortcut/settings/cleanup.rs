//! Settings commands for the on-device cleanup pipeline.
//!
//! Phase 1 wired the `cleanup_*` fields into `AppSettings` but didn't
//! expose individual update commands — settings could only be modified
//! by reseating the entire blob. Phase 2 needs the settings panel to
//! toggle `cleanup_enabled`, edit `cleanup_dictionary`, etc., so this
//! module adds the dedicated per-field update commands.

use tauri::AppHandle;

use crate::settings::{self, DictionaryEntrySetting};

/// Toggle the on-device cleanup pipeline.
#[tauri::command]
pub fn change_cleanup_enabled_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.cleanup_enabled = enabled;
    });
    Ok(())
}

/// Toggle whether the cleanup prompt may include focused-application
/// context (Phase 3). Until Phase 3 ships this is purely a stored
/// preference; the prompt builder does not yet consume it.
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

/// Replace the user dictionary in one shot. The frontend owns the
/// editing UX and always sends the full list, so we don't bother with
/// per-entry add/remove commands.
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
