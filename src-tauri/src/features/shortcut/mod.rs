pub mod bindings;
pub mod failures;
pub mod init;
pub mod overlay_keys;
pub mod settings;

#[cfg(target_os = "linux")]
pub mod wayland;

pub use init::init_shortcuts;

#[cfg(target_os = "linux")]
pub use wayland::init_wayland_state;

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

/// Wayland leaks printable keys through to the focused app.
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

/// Empty unless on Wayland with an initialized portal session.
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WaylandShortcutInfoResponse {
    pub id: String,
    pub trigger: String,
    pub has_printable_key: bool,
}

/// Portal v2 dialog; changes arrive later on the `wayland-shortcuts-changed` event.
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
