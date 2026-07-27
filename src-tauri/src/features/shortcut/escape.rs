use log::{error, warn};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::utils;

/// Call when the recording overlay becomes visible.
#[tauri::command]
pub fn register_escape_shortcut(app: AppHandle) -> Result<(), String> {
    let escape_shortcut = match "escape".parse::<Shortcut>() {
        Ok(s) => s,
        Err(e) => {
            let error_msg = format!("Failed to parse escape shortcut: {}", e);
            error!("{}", error_msg);
            return Err(error_msg);
        }
    };

    // ours must take precedence over any existing handler
    if app.global_shortcut().is_registered(escape_shortcut) {
        warn!("Escape shortcut already registered, unregistering to use our handler");
        if let Err(e) = app.global_shortcut().unregister(escape_shortcut) {
            warn!(
                "Warning: Failed to unregister existing escape shortcut: {}. Continuing with registration anyway.",
                e
            );
        }
    }

    app.global_shortcut()
        .on_shortcut(escape_shortcut, move |ah, scut, event| {
            if scut == &escape_shortcut && event.state == ShortcutState::Pressed {
                utils::cancel_current_operation(ah);
            }
        })
        .map_err(|e| {
            let error_msg = format!("Failed to register escape shortcut: {}", e);
            error!("{}", error_msg);
            error_msg
        })?;

    Ok(())
}

/// Call when the recording overlay becomes hidden.
#[tauri::command]
pub fn unregister_escape_shortcut(app: AppHandle) -> Result<(), String> {
    let escape_shortcut = match "escape".parse::<Shortcut>() {
        Ok(s) => s,
        Err(e) => {
            let error_msg = format!("Failed to parse escape shortcut for unregistration: {}", e);
            error!("{}", error_msg);
            return Err(error_msg);
        }
    };

    if app.global_shortcut().is_registered(escape_shortcut) {
        app.global_shortcut()
            .unregister(escape_shortcut)
            .map_err(|e| {
                let error_msg = format!("Failed to unregister escape shortcut: {}", e);
                error!("{}", error_msg);
                error_msg
            })?;
    }

    Ok(())
}
