//! Shortcut binding management commands.
//!
//! On X11/Windows/macOS, changing a binding unregisters the old shortcut and
//! registers the new one via the global shortcut plugin.
//! On Wayland, shortcuts are managed by the XDG Portal; changing a binding
//! saves the new value and re-initializes the portal session so the user
//! is prompted to authorize the new shortcut.

use log::{debug, error, info, warn};
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

/// Change a shortcut binding to a new key combination.
///
/// On Wayland, this updates settings and re-initializes shortcuts via the
/// XDG Portal. We *await* the portal so the system dialog appears and the user
/// can authorize the new shortcut; any error is returned to the frontend.
#[tauri::command]
pub async fn change_binding(
    app: AppHandle,
    id: String,
    binding: String,
) -> Result<BindingResponse, String> {
    let mut settings = settings::get_settings(&app);

    // Get the binding to modify
    let binding_to_modify = match settings.bindings.get(&id) {
        Some(binding) => binding.clone(),
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

    // Validate the new shortcut before updating
    if let Err(e) = validate_shortcut_string(&binding) {
        warn!("change_binding validation error: {}", e);
        return Err(e);
    }

    // Create the updated binding (clone so we keep binding_to_modify for X11 unregister)
    let mut updated_binding = binding_to_modify.clone();
    updated_binding.current_binding = binding.clone();

    // Update the binding in the settings (we save before re-init so Wayland reads the new value)
    settings
        .bindings
        .insert(id.clone(), updated_binding.clone());
    settings::write_settings(&app, settings);

    // Platform-specific: register the new shortcut
    #[cfg(target_os = "linux")]
    {
        if super::wayland::is_wayland_session() {
            // Wayland: open the system configuration dialog (portal v2).
            // The preferred_trigger is saved in settings and will be used on next
            // session init. For immediate changes, the user configures via the
            // system dialog and we receive ShortcutsChanged asynchronously.
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

/// X11 / Windows / macOS: unregister old shortcut and register the new one.
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

/// Reset a shortcut binding to its default value.
#[tauri::command]
pub async fn reset_binding(app: AppHandle, id: String) -> Result<BindingResponse, String> {
    let binding = settings::get_stored_binding(&app, &id);
    change_binding(app, id, binding.default_binding).await
}

/// Temporarily unregister a binding while the user is editing it in the UI.
/// This avoids firing the action while keys are being recorded.
///
/// On Wayland, this is a no-op: the XDG Portal manages all shortcuts as a session;
/// the new shortcut is applied when the user confirms (change_binding) and the
/// portal is re-initialized.
#[tauri::command]
pub fn suspend_binding(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if super::wayland::is_wayland_session() {
        debug!("[Shortcuts] suspend_binding: Wayland session, no-op for '{}'", id);
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

/// Re-register the binding after the user has finished editing.
///
/// On Wayland, this is a no-op (shortcuts are re-applied when change_binding is called).
#[tauri::command]
pub fn resume_binding(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    if super::wayland::is_wayland_session() {
        debug!("[Shortcuts] resume_binding: Wayland session, no-op for '{}'", id);
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
