//! Wayland routes every binding through the XDG Portal; other platforms use the global shortcut plugin.

#[cfg(target_os = "linux")]
use log::{debug, info};
use log::{error, warn};
use serde::Serialize;
use tauri::AppHandle;

use super::init::{register_shortcut, unregister_shortcut, validate_shortcut_string};
use crate::settings::{self, ShortcutBinding};

#[derive(Serialize)]
pub struct BindingResponse {
    pub success: bool,
    pub binding: Option<ShortcutBinding>,
    pub error: Option<String>,
}

/// Awaits the Wayland portal so its authorization dialog can surface.
#[tauri::command]
pub async fn change_binding(
    app: AppHandle,
    id: String,
    binding: String,
) -> Result<BindingResponse, String> {
    // old value needed for the X11 unregister
    let binding_to_modify = match settings::get_settings(&app).bindings.get(&id).cloned() {
        Some(b) => b,
        None => {
            let error_msg = format!("Binding with id '{}' not found", id);
            error!("change_binding error: {}", error_msg);
            return Ok(BindingResponse {
                success: false,
                binding: None,
                error: Some(error_msg),
            });
        }
    };

    if let Err(e) = validate_shortcut_string(&binding) {
        warn!("change_binding validation error: {}", e);
        return Err(e);
    }

    let mut updated_binding = binding_to_modify.clone();
    updated_binding.current_binding = binding.clone();

    // save before re-init — Wayland reads settings back
    let ub = updated_binding.clone();
    settings::update_settings(&app, |s| {
        s.bindings.insert(id.clone(), ub);
    });

    #[cfg(target_os = "linux")]
    {
        if super::wayland::is_wayland_session() {
            // portal v2 confirms asynchronously via ShortcutsChanged
            info!("[Shortcuts] Wayland: opening configure dialog for '{}'", id);
            match super::wayland::request_configure(&app, None).await {
                Ok(()) => {
                    info!("[Shortcuts] Wayland configure dialog opened");
                    Ok(BindingResponse {
                        success: true,
                        binding: Some(updated_binding),
                        error: None,
                    })
                }
                Err(e) => {
                    error!("[Shortcuts] Failed to open Wayland configure dialog: {}", e);
                    Ok(BindingResponse {
                        success: false,
                        binding: Some(updated_binding),
                        error: Some(format!(
                            "Could not open shortcut configuration. Ensure the Global Shortcuts portal is available (GNOME 45+ / KDE Plasma 6+). Details: {}",
                            e
                        )),
                    })
                }
            }
        } else {
            do_change_binding_x11(&app, binding_to_modify, updated_binding)
        }
    }

    #[cfg(not(target_os = "linux"))]
    do_change_binding_x11(&app, binding_to_modify, updated_binding)
}

fn do_change_binding_x11(
    app: &AppHandle,
    binding_to_modify: ShortcutBinding,
    updated_binding: ShortcutBinding,
) -> Result<BindingResponse, String> {
    if let Err(e) = unregister_shortcut(app, binding_to_modify) {
        let error_msg = format!("Failed to unregister shortcut: {}", e);
        error!("change_binding error: {}", error_msg);
    }

    if let Err(e) = register_shortcut(app, updated_binding.clone()) {
        let error_msg = format!("Failed to register shortcut: {}", e);
        error!("change_binding error: {}", error_msg);
        return Ok(BindingResponse {
            success: false,
            binding: None,
            error: Some(error_msg),
        });
    }

    Ok(BindingResponse {
        success: true,
        binding: Some(updated_binding),
        error: None,
    })
}

#[tauri::command]
pub async fn reset_binding(app: AppHandle, id: String) -> Result<BindingResponse, String> {
    let binding = settings::get_stored_binding(&app, &id);
    change_binding(app, id, binding.default_binding).await
}

/// Keeps the action from firing while keys are being recorded. No-op on Wayland.
#[tauri::command]
pub fn suspend_binding(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if super::wayland::is_wayland_session() {
        debug!(
            "[Shortcuts] suspend_binding: Wayland session, no-op for '{}'",
            id
        );
        return Ok(());
    }

    if let Some(b) = settings::get_bindings(&app).get(&id).cloned() {
        if let Err(e) = unregister_shortcut(&app, b) {
            error!("suspend_binding error for id '{}': {}", id, e);
            return Err(e);
        }
    }
    Ok(())
}

/// No-op on Wayland — `change_binding` re-applies there.
#[tauri::command]
pub fn resume_binding(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if super::wayland::is_wayland_session() {
        debug!(
            "[Shortcuts] resume_binding: Wayland session, no-op for '{}'",
            id
        );
        return Ok(());
    }

    if let Some(b) = settings::get_bindings(&app).get(&id).cloned() {
        if let Err(e) = register_shortcut(&app, b) {
            error!("resume_binding error for id '{}': {}", id, e);
            return Err(e);
        }
    }
    Ok(())
}
