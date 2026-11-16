pub mod audio;
pub mod file_transcription;
pub mod history;
pub mod input_tracking;
pub mod meeting;
pub mod models;
pub mod transcription;
pub mod voice_tools;

use crate::settings;
use crate::utils::cancel_current_operation;
use log::LevelFilter;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn cancel_operation(app: AppHandle) {
    cancel_current_operation(&app);
}

#[tauri::command]
pub fn get_app_dir_path(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    Ok(app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_log_dir_path(app: AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    Ok(log_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let path = log_dir.to_string_lossy().as_ref().to_string();
    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open log directory: {}", e))?;

    Ok(())
}

pub(crate) fn file_log_filter(level: tauri_plugin_log::LogLevel) -> LevelFilter {
    log::Level::from(level).to_level_filter()
}

#[tauri::command]
pub fn set_log_level(app: AppHandle, level: tauri_plugin_log::LogLevel) -> Result<(), String> {
    crate::FILE_LOG_LEVEL.store(
        file_log_filter(level.clone()) as u8,
        std::sync::atomic::Ordering::Relaxed,
    );

    settings::update_settings(&app, |s| {
        s.log_level = level;
    });

    Ok(())
}

#[tauri::command]
pub fn open_recordings_folder(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let recordings_dir = app_data_dir.join("recordings");
    let path = recordings_dir.to_string_lossy().as_ref().to_string();

    app.opener()
        .open_path(path, None::<String>)
        .map_err(|e| format!("Failed to open recordings folder: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::file_log_filter;
    use log::LevelFilter;
    use tauri_plugin_log::LogLevel;

    #[test]
    fn the_stored_level_number_sets_the_matching_file_log_verbosity() {
        for (stored, verbosity) in [
            (1, LevelFilter::Trace),
            (2, LevelFilter::Debug),
            (3, LevelFilter::Info),
            (4, LevelFilter::Warn),
            (5, LevelFilter::Error),
        ] {
            let level: LogLevel = serde_json::from_value(serde_json::json!(stored)).unwrap();

            assert_eq!(file_log_filter(level.clone()), verbosity);
            assert_eq!(
                serde_json::to_value(level).unwrap(),
                serde_json::json!(stored)
            );
        }
    }
}
