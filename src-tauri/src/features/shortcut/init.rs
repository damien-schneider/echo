//! Wayland goes through the XDG Desktop Portal; every other platform uses tauri-plugin-global-shortcut.

use log::{error, info, warn};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use super::failures::{self, ShortcutFailure};
use crate::actions::{ShortcutAction, ACTION_MAP};
use crate::settings::{self, get_settings, ShortcutBinding};
use crate::ManagedToggleState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShortcutEvent {
    Pressed,
    Released,
}

#[derive(Debug, Clone, Copy)]
struct ShortcutTransition {
    is_one_shot: bool,
    push_to_talk: bool,
    event: ShortcutEvent,
    is_active: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ShortcutExecution {
    None,
    Start,
    Stop,
}

fn shortcut_transition(transition: ShortcutTransition) -> ShortcutExecution {
    if transition.is_one_shot {
        return match transition.event {
            ShortcutEvent::Pressed => ShortcutExecution::None,
            ShortcutEvent::Released => ShortcutExecution::Start,
        };
    }
    if transition.push_to_talk {
        return match transition.event {
            ShortcutEvent::Pressed => ShortcutExecution::Start,
            ShortcutEvent::Released => ShortcutExecution::Stop,
        };
    }
    match transition.event {
        ShortcutEvent::Pressed if transition.is_active => ShortcutExecution::Stop,
        ShortcutEvent::Pressed => ShortcutExecution::Start,
        ShortcutEvent::Released => ShortcutExecution::None,
    }
}

pub(super) fn execute_toggle_transition<F>(
    state: &ManagedToggleState,
    binding_id: &str,
    execute: F,
) -> Result<(), String>
where
    F: FnOnce(ShortcutExecution),
{
    let execution = {
        let mut states = state
            .lock()
            .map_err(|_| "Failed to lock toggle state manager".to_string())?;
        let is_active = states
            .active_toggles
            .entry(binding_id.to_string())
            .or_insert(false);
        let execution = shortcut_transition(ShortcutTransition {
            is_one_shot: false,
            push_to_talk: false,
            event: ShortcutEvent::Pressed,
            is_active: *is_active,
        });
        match execution {
            ShortcutExecution::Start => *is_active = true,
            ShortcutExecution::Stop => *is_active = false,
            ShortcutExecution::None => {}
        }
        execution
    };

    execute(execution);
    Ok(())
}

/// Skips bindings with no entry in ACTION_MAP.
pub fn init_shortcuts(app: &AppHandle) {
    #[cfg(target_os = "linux")]
    {
        let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
        let wayland_display = std::env::var("WAYLAND_DISPLAY").unwrap_or_default();
        info!(
            "[Shortcuts] Session detection: XDG_SESSION_TYPE='{}', WAYLAND_DISPLAY='{}'",
            session_type, wayland_display
        );

        if super::wayland::is_wayland_session() {
            info!("[Shortcuts] Wayland session detected, using XDG Portal for global shortcuts");
            init_wayland_shortcuts(app);
            return;
        }
        info!("[Shortcuts] X11 session detected, using standard global shortcut plugin");
    }

    init_x11_shortcuts(app);
}

fn init_x11_shortcuts(app: &AppHandle) {
    let settings = settings::load_or_create_app_settings(app);

    info!(
        "[Shortcuts] Registering {} shortcut binding(s)",
        settings.bindings.len()
    );

    for (_id, binding) in settings.bindings {
        if !ACTION_MAP.contains_key(&binding.id) {
            warn!(
                "Skipping binding '{}' - no action defined in ACTION_MAP",
                binding.id
            );
            continue;
        }
        if let Err(e) = register_shortcut(app, binding.clone()) {
            error!("Failed to register shortcut {}: {}", binding.id, e);
        } else {
            info!(
                "[Shortcuts] Registered '{}' -> {}",
                binding.id, binding.current_binding
            );
        }
    }
}

#[cfg(target_os = "linux")]
fn init_wayland_shortcuts(app: &AppHandle) {
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        match super::wayland::init_wayland_shortcuts(&app_clone).await {
            Ok(()) => {
                info!("[Shortcuts] Wayland shortcuts initialized successfully");
            }
            Err(e) => {
                error!("[Shortcuts] Failed to initialize Wayland shortcuts: {}", e);
                error!("[Shortcuts] Global shortcuts will not be available in this session");
            }
        }
    });
}

/// Rejects modifier-only combos; a bare "f5" or "space" is fine.
pub fn validate_shortcut_string(raw: &str) -> Result<(), String> {
    let modifiers = [
        "ctrl", "control", "shift", "alt", "option", "meta", "command", "cmd", "super", "win",
        "windows",
    ];
    let has_non_modifier = raw
        .split('+')
        .any(|part| !modifiers.contains(&part.trim().to_lowercase().as_str()));
    if has_non_modifier {
        Ok(())
    } else {
        Err("Shortcut must contain at least one non-modifier key".into())
    }
}

pub fn register_shortcut(app: &AppHandle, binding: ShortcutBinding) -> Result<(), String> {
    let binding_id = binding.id.clone();
    let binding_text = binding.current_binding.clone();
    if let Err(reason) = claim_shortcut(app, binding) {
        let message = format!("Couldn't register shortcut '{binding_text}': {reason}");
        error!("register_shortcut error: {message}");
        failures::record(
            app,
            ShortcutFailure {
                binding_id,
                binding: binding_text,
                reason,
            },
        );
        return Err(message);
    }
    failures::clear(app, &binding_id);
    Ok(())
}

fn claim_shortcut(app: &AppHandle, binding: ShortcutBinding) -> Result<(), String> {
    let shortcut = validated_shortcut(app, &binding)?;
    let binding_id = binding.id;
    app.global_shortcut()
        .on_shortcut(shortcut, move |ah, scut, event| {
            if scut != &shortcut {
                return;
            }
            dispatch_shortcut(ShortcutInvocation {
                app: ah,
                binding_id: &binding_id,
                shortcut: &scut.into_string(),
                event: shortcut_event(event.state),
            });
        })
        .map_err(|e| e.to_string())
}

fn validated_shortcut(app: &AppHandle, binding: &ShortcutBinding) -> Result<Shortcut, String> {
    if !ACTION_MAP.contains_key(&binding.id) {
        let message = format!(
            "No action defined in ACTION_MAP for binding ID '{}'",
            binding.id
        );
        error!("register_shortcut error: {message}");
        return Err(message);
    }
    validate_shortcut_string(&binding.current_binding).map_err(|message| {
        warn!("register_shortcut validation error: {message}");
        message
    })?;
    let shortcut = binding
        .current_binding
        .parse::<Shortcut>()
        .map_err(|error| {
            let message = format!(
                "Failed to parse shortcut '{}': {error}",
                binding.current_binding
            );
            error!("register_shortcut parse error: {message}");
            message
        })?;
    if app.global_shortcut().is_registered(shortcut) {
        let message = format!("Shortcut '{}' is already in use", binding.current_binding);
        warn!("register_shortcut duplicate error: {message}");
        return Err(message);
    }
    Ok(shortcut)
}

struct ShortcutInvocation<'a> {
    app: &'a AppHandle,
    binding_id: &'a str,
    shortcut: &'a str,
    event: ShortcutEvent,
}

fn dispatch_shortcut(invocation: ShortcutInvocation<'_>) {
    let Some(action) = ACTION_MAP.get(invocation.binding_id) else {
        warn!(
            "No action defined for shortcut ID '{}'",
            invocation.binding_id
        );
        return;
    };
    let push_to_talk = get_settings(invocation.app).push_to_talk;
    if action.is_one_shot() || push_to_talk {
        let execution = shortcut_transition(ShortcutTransition {
            is_one_shot: action.is_one_shot(),
            push_to_talk,
            event: invocation.event,
            is_active: false,
        });
        execute_action(action.as_ref(), &invocation, execution);
        return;
    }
    if invocation.event != ShortcutEvent::Pressed {
        return;
    }
    let state = invocation.app.state::<ManagedToggleState>();
    let result = execute_toggle_transition(&state, invocation.binding_id, |execution| {
        execute_action(action.as_ref(), &invocation, execution);
    });
    if let Err(error) = result {
        error!("[Shortcuts] {error}");
    }
}

fn execute_action(
    action: &dyn ShortcutAction,
    invocation: &ShortcutInvocation<'_>,
    execution: ShortcutExecution,
) {
    match execution {
        ShortcutExecution::Start => {
            action.start(invocation.app, invocation.binding_id, invocation.shortcut)
        }
        ShortcutExecution::Stop => {
            action.stop(invocation.app, invocation.binding_id, invocation.shortcut)
        }
        ShortcutExecution::None => {}
    }
}

fn shortcut_event(state: ShortcutState) -> ShortcutEvent {
    if state == ShortcutState::Pressed {
        return ShortcutEvent::Pressed;
    }
    ShortcutEvent::Released
}

pub fn unregister_shortcut(app: &AppHandle, binding: ShortcutBinding) -> Result<(), String> {
    let shortcut = match binding.current_binding.parse::<Shortcut>() {
        Ok(s) => s,
        Err(e) => {
            let error_msg = format!(
                "Failed to parse shortcut '{}' for unregistration: {}",
                binding.current_binding, e
            );
            error!("unregister_shortcut parse error: {}", error_msg);
            return Err(error_msg);
        }
    };

    app.global_shortcut().unregister(shortcut).map_err(|e| {
        let error_msg = format!(
            "Failed to unregister shortcut '{}': {}",
            binding.current_binding, e
        );
        error!("unregister_shortcut error: {}", error_msg);
        error_msg
    })?;

    Ok(())
}

#[cfg(test)]
#[path = "init_tests.rs"]
mod tests;
