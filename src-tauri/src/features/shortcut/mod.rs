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
