pub mod audio;
pub mod file_transcription;
pub mod history;
pub mod input_tracking;
pub mod models;
pub mod transcription;
pub mod tts;

use crate::utils::cancel_current_operation;
use crate::settings;
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

fn map_log_level_u8_to_filter(level: u8) -> LevelFilter {
    match level {
        1 => LevelFilter::Error,
        2 => LevelFilter::Warn,
        3 => LevelFilter::Info,
        4 => LevelFilter::Debug,
        5 => LevelFilter::Trace,
        _ => LevelFilter::Info,
    }
}

fn map_log_level_u8_to_tauri(level: u8) -> tauri_plugin_log::LogLevel {
    match level {
        1 => tauri_plugin_log::LogLevel::Error,
        2 => tauri_plugin_log::LogLevel::Warn,
        3 => tauri_plugin_log::LogLevel::Info,
        4 => tauri_plugin_log::LogLevel::Debug,
        5 => tauri_plugin_log::LogLevel::Trace,
        _ => tauri_plugin_log::LogLevel::Info,
    }
}

#[tauri::command]
pub fn set_log_level(app: AppHandle, level: u8) -> Result<(), String> {
    // Map integer to LogLevel enum used in settings
    let pl_level = map_log_level_u8_to_tauri(level);

    // Update the file log level atomic so the filter picks up the new level
    crate::FILE_LOG_LEVEL.store(map_log_level_u8_to_filter(level) as u8, std::sync::atomic::Ordering::Relaxed);

    // Also persist to settings for the UI (store LogLevel as enum value)
    let mut settings = settings::get_settings(&app);
    settings.log_level = pl_level;
    settings::write_settings(&app, settings);

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
