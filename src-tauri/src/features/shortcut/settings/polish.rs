use tauri::AppHandle;

use crate::settings;
use crate::settings::PolishLevel;

#[tauri::command]
pub fn change_polish_level_setting(app: AppHandle, level: PolishLevel) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.polish_level = level;
    });
    Ok(())
}
