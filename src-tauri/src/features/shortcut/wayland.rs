mod actions;
mod dconf;
mod portal;
mod trigger;

use log::{debug, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use tokio::sync::{mpsc, oneshot};

pub use portal::{init_wayland_shortcuts, request_configure};

pub(crate) enum WaylandCommand {
    Configure {
        respond: oneshot::Sender<Result<(), String>>,
    },
}

#[derive(Debug, Clone, Default)]
pub struct WaylandShortcutState {
    pub triggers: HashMap<String, String>,
    pub ready: bool,
    pub last_error: Option<String>,
}

pub type ManagedWaylandState = Arc<Mutex<WaylandShortcutState>>;
pub type ManagedWaylandCommandSender = Arc<Mutex<Option<mpsc::Sender<WaylandCommand>>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaylandShortcutInfo {
    pub id: String,
    pub trigger: String,
    pub has_printable_key: bool,
}

pub fn init_wayland_state(app: &AppHandle) {
    let state: ManagedWaylandState = Arc::new(Mutex::new(WaylandShortcutState::default()));
    let command_sender: ManagedWaylandCommandSender = Arc::new(Mutex::new(None));
    app.manage(state);
    app.manage(command_sender);
    debug!("[Wayland] Initialized shortcut state");
}

pub fn is_wayland_session() -> bool {
    std::env::var("XDG_SESSION_TYPE").is_ok_and(|session| session.eq_ignore_ascii_case("wayland"))
}

pub fn needs_backspace_workaround(app: &AppHandle, shortcut_id: &str) -> bool {
    actions::needs_backspace_workaround(app, shortcut_id)
}

pub fn get_wayland_shortcuts(app: &AppHandle) -> Vec<WaylandShortcutInfo> {
    if !is_wayland_session() {
        return Vec::new();
    }
    let Some(state) = app.try_state::<ManagedWaylandState>() else {
        debug!("[Wayland] Shortcut state unavailable");
        return Vec::new();
    };
    let Ok(state) = state.lock() else {
        warn!("[Wayland] Failed to lock shortcut state");
        return Vec::new();
    };
    if !state.ready {
        return Vec::new();
    }
    state
        .triggers
        .iter()
        .map(|(id, trigger)| WaylandShortcutInfo {
            id: id.clone(),
            trigger: trigger.clone(),
            has_printable_key: trigger::trigger_has_printable_key(trigger),
        })
        .collect()
}
