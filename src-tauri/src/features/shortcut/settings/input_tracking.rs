//! Input tracking settings commands.

use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::managers::input_tracker::InputTrackerManager;
use crate::settings;

/// Change input tracking setting.
#[tauri::command]
pub fn change_input_tracking_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    log::info!(
        "[InputTracker] change_input_tracking_setting called with enabled={}",
        enabled
    );

    settings::update_settings(&app, |s| {
        s.input_tracking_enabled = enabled;
    });

    // Side effect outside lock: update the input tracker manager state
    if let Some(manager) = app.try_state::<Arc<std::sync::Mutex<InputTrackerManager>>>() {
        log::info!("[InputTracker] Found manager state, updating...");
        if let Ok(mut tracker) = manager.lock() {
            tracker.set_enabled(enabled, &app);
        } else {
            log::error!("[InputTracker] Failed to lock manager");
        }
    } else {
        log::error!("[InputTracker] Manager not found in app state!");
    }

    Ok(())
}

/// Change input tracking excluded apps.
#[tauri::command]
pub fn change_input_tracking_excluded_apps(
    app: AppHandle,
    apps: Vec<String>,
) -> Result<(), String> {
    log::info!(
        "[InputTracker] change_input_tracking_excluded_apps called with {} apps",
        apps.len()
    );

    let apps_for_manager = apps.clone();
    settings::update_settings(&app, |s| {
        s.input_tracking_excluded_apps = apps;
    });

    // Side effect outside lock: update the input tracker manager
    if let Some(manager) = app.try_state::<Arc<std::sync::Mutex<InputTrackerManager>>>() {
        if let Ok(tracker) = manager.lock() {
            tracker.set_excluded_apps(apps_for_manager);
        }
    }

    Ok(())
}

/// Change input tracking idle timeout.
#[tauri::command]
pub fn change_input_tracking_idle_timeout(
    app: AppHandle,
    timeout_secs: Option<u64>,
) -> Result<(), String> {
    log::info!(
        "[InputTracker] change_input_tracking_idle_timeout called with timeout={:?}",
        timeout_secs
    );

    settings::update_settings(&app, |s| {
        s.input_tracking_idle_timeout = timeout_secs;
    });

    // Side effect outside lock: update the input tracker manager
    if let Some(manager) = app.try_state::<Arc<std::sync::Mutex<InputTrackerManager>>>() {
        if let Ok(tracker) = manager.lock() {
            // 0 means disabled, None also means disabled
            tracker.set_idle_timeout(timeout_secs.unwrap_or(0));
        }
    }

    Ok(())
}
