//! Shortcut feature module.
//!
//! This module handles all keyboard shortcut functionality including:
//! - Shortcut initialization and registration (`init`)
//! - Escape key handling for canceling operations (`escape`)
//! - Binding management commands (`bindings`)
//! - Settings commands organized by feature area (`settings`)
//! - Wayland-specific global shortcuts via XDG Portal (`wayland`)

pub mod bindings;
pub mod escape;
pub mod init;
pub mod settings;

// Wayland support via XDG Desktop Portal (Linux only)
#[cfg(target_os = "linux")]
pub mod wayland;

// Re-export the main initialization function
pub use init::init_shortcuts;

// Re-export Wayland types for use in lib.rs
#[cfg(target_os = "linux")]
pub use wayland::init_wayland_state;
// WaylandShortcutInfo is used internally by the wayland module;
// ManagedWaylandCommandSender is registered via app.manage() in init_wayland_state.

/// Check if we're running in a Wayland session.
/// Returns false on non-Linux platforms.
#[tauri::command]
pub fn is_wayland_session() -> bool {
    #[cfg(target_os = "linux")]
    {
        wayland::is_wayland_session()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

/// Check if a shortcut binding has a printable key that may cause issues on Wayland.
/// Returns the problematic key name if found, None otherwise.
/// On non-Linux platforms, always returns None.
#[tauri::command]
pub fn check_wayland_shortcut_conflict(binding: String) -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        wayland::check_wayland_shortcut_conflict(binding)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = binding;
        None
    }
}

/// Get the current Wayland shortcuts with their actual triggers from the portal.
/// Returns an empty list if not on Wayland or if shortcuts haven't been initialized yet.
/// On non-Linux platforms, always returns an empty list.
#[tauri::command]
pub fn get_wayland_shortcuts(app: tauri::AppHandle) -> Vec<WaylandShortcutInfoResponse> {
    #[cfg(target_os = "linux")]
    {
        wayland::get_wayland_shortcuts(&app)
            .into_iter()
            .map(|info| WaylandShortcutInfoResponse {
                id: info.id,
                trigger: info.trigger,
                has_printable_key: info.has_printable_key,
            })
            .collect()
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        Vec::new()
    }
}

/// Response type for get_wayland_shortcuts command
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WaylandShortcutInfoResponse {
    pub id: String,
    pub trigger: String,
    pub has_printable_key: bool,
}

/// Open the system dialog to configure Wayland shortcuts.
/// On Wayland, this opens the desktop portal's shortcut configuration UI (portal v2).
/// Shortcut changes arrive asynchronously via the "wayland-shortcuts-changed" event.
/// On non-Linux platforms, this returns an error.
#[tauri::command]
pub async fn open_wayland_shortcut_settings(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        wayland::open_wayland_shortcut_settings(&app).await
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = app;
        Err("Wayland shortcuts are only available on Linux".to_string())
    }
}
