use log::{debug, error, info, warn};
use std::process::Command;
use tauri::{AppHandle, Manager};

use super::trigger::{printable_key_from_binding, trigger_has_printable_key};
use super::ManagedWaylandState;
use crate::actions::ACTION_MAP;
use crate::features::shortcut::init::{execute_toggle_transition, ShortcutExecution};
use crate::settings;
use crate::ManagedToggleState;

pub(super) fn handle_activated(app: &AppHandle, shortcut_id: &str) {
    let Some(action) = ACTION_MAP.get(shortcut_id) else {
        warn!("[Wayland] No action found for shortcut ID: {shortcut_id}");
        return;
    };

    schedule_backspace_if_needed(app, shortcut_id);
    let current_settings = settings::get_settings(app);

    if action.is_one_shot() {
        info!("[Wayland] Waiting for release of one-shot action '{shortcut_id}'");
        return;
    }
    if current_settings.push_to_talk {
        info!("[Wayland] PTT mode: starting action for '{shortcut_id}'");
        action.start(app, shortcut_id, shortcut_id);
        return;
    }
    execute_toggle(app, shortcut_id);
}

fn execute_toggle(app: &AppHandle, shortcut_id: &str) {
    let Some(action) = ACTION_MAP.get(shortcut_id) else {
        return;
    };
    let toggle_state = app.state::<ManagedToggleState>();
    let result =
        execute_toggle_transition(&toggle_state, shortcut_id, |execution| match execution {
            ShortcutExecution::Start => action.start(app, shortcut_id, shortcut_id),
            ShortcutExecution::Stop => action.stop(app, shortcut_id, shortcut_id),
            ShortcutExecution::None => {}
        });
    if let Err(error) = result {
        error!("[Wayland] {error}");
    }
}

pub(super) fn handle_deactivated(app: &AppHandle, shortcut_id: &str) {
    let Some(action) = ACTION_MAP.get(shortcut_id) else {
        return;
    };
    let current_settings = settings::get_settings(app);

    if action.is_one_shot() {
        info!("[Wayland] Executing released one-shot action '{shortcut_id}'");
        action.start(app, shortcut_id, shortcut_id);
    } else if current_settings.push_to_talk {
        info!("[Wayland] PTT mode: stopping action for '{shortcut_id}'");
        action.stop(app, shortcut_id, shortcut_id);
    }
}

fn schedule_backspace_if_needed(app: &AppHandle, shortcut_id: &str) {
    if !needs_backspace_workaround(app, shortcut_id) {
        return;
    }
    debug!("[Wayland] Applying backspace workaround for shortcut '{shortcut_id}'");
    std::thread::spawn(send_backspace_workaround);
}

fn send_backspace_workaround() {
    std::thread::sleep(std::time::Duration::from_millis(30));
    match Command::new("wtype").args(["-k", "BackSpace"]).output() {
        Ok(output) if output.status.success() => {
            debug!("[Wayland] Backspace workaround sent successfully");
        }
        Ok(output) => warn!(
            "[Wayland] wtype backspace failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ),
        Err(error) => debug!("[Wayland] Could not execute wtype: {error}"),
    }
}

pub(super) fn needs_backspace_workaround(app: &AppHandle, shortcut_id: &str) -> bool {
    if let Some(trigger) = portal_trigger(app, shortcut_id) {
        debug!("[Wayland] Checking actual portal trigger: {trigger}");
        return trigger_has_printable_key(&trigger);
    }
    settings::get_bindings(app)
        .get(shortcut_id)
        .and_then(|binding| printable_key_from_binding(&binding.current_binding))
        .is_some()
}

fn portal_trigger(app: &AppHandle, shortcut_id: &str) -> Option<String> {
    let state = app.try_state::<ManagedWaylandState>()?;
    let state = state.lock().ok()?;
    state.triggers.get(shortcut_id).cloned()
}
