//! Wayland goes through the XDG Desktop Portal; macOS combos holding Fn go through `fn_key`; everything else uses tauri-plugin-global-shortcut.

use log::{error, info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use super::combo::Combo;
use super::failures::{self, ShortcutFailure};
#[cfg(target_os = "macos")]
use super::fn_key::FnHotkeys;
use crate::actions::{ShortcutAction, ACTION_MAP};
use crate::managers::audio::AudioRecordingManager;
use crate::settings::{get_settings, ShortcutBinding};
use crate::HeldShortcuts;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ShortcutEvent {
    Pressed,
    Released,
}

#[derive(Debug, Clone, Copy)]
struct ShortcutTransition {
    is_one_shot: bool,
    push_to_talk: bool,
    event: ShortcutEvent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShortcutExecution {
    None,
    Start,
    Stop,
    Toggle,
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
        ShortcutEvent::Pressed => ShortcutExecution::Toggle,
        ShortcutEvent::Released => ShortcutExecution::None,
    }
}

/// The recorder says whether a press starts or stops: a flag kept here drifts after a refused or failed start.
pub(crate) fn toggle_dictation(app: &AppHandle, binding_id: &str, shortcut: &str) {
    let Some(action) = ACTION_MAP.get(binding_id) else {
        warn!("No action defined for shortcut ID '{binding_id}'");
        return;
    };
    let recording = app.state::<Arc<AudioRecordingManager>>();
    match recording.active_binding_id() {
        Some(active) => action.stop(app, &active, shortcut),
        None => action.start(app, binding_id, shortcut),
    }
}

/// Windows can re-fire a held shortcut's press, and sends one release per press; count each edge once.
fn is_key_edge(held: &HeldShortcuts, binding_id: &str, event: ShortcutEvent) -> bool {
    let Ok(mut held) = held.0.lock() else {
        return true;
    };
    match event {
        ShortcutEvent::Pressed => held.insert(binding_id.to_string()),
        ShortcutEvent::Released => held.remove(binding_id),
    }
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
    let settings = get_settings(app);

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

pub(super) fn holds_binding(app: &AppHandle, binding: &ShortcutBinding) -> bool {
    let Ok(combo) = Combo::parse(&binding.current_binding) else {
        return false;
    };
    #[cfg(target_os = "macos")]
    if combo.holds_fn() {
        return app.state::<FnHotkeys>().holds(&binding.id, &combo);
    }
    app.global_shortcut()
        .is_registered(combo.to_string().as_str())
}

pub(super) fn registration_refusal(combo: &str, reason: &str) -> String {
    format!("Couldn't register shortcut '{combo}': {reason}")
}

pub fn register_shortcut(app: &AppHandle, binding: ShortcutBinding) -> Result<(), String> {
    let binding_id = binding.id.clone();
    let binding_text = binding.current_binding.clone();
    if let Err(reason) = claim_shortcut(app, binding) {
        let message = registration_refusal(&binding_text, &reason);
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

pub(super) fn claim_shortcut(app: &AppHandle, binding: ShortcutBinding) -> Result<(), String> {
    let combo = usable_combo(&binding)?;
    #[cfg(target_os = "macos")]
    if combo.holds_fn() {
        return app.state::<FnHotkeys>().claim(app, &binding.id, &combo);
    }
    let shortcut = free_shortcut(app, &combo)?;
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
        .map_err(|refusal| {
            error!("The OS refused shortcut '{combo}': {refusal}");
            "Another app or the system already uses it — pick another combination in Settings → Shortcuts".to_string()
        })
}

fn usable_combo(binding: &ShortcutBinding) -> Result<Combo, String> {
    if !ACTION_MAP.contains_key(&binding.id) {
        let message = format!(
            "No action defined in ACTION_MAP for binding ID '{}'",
            binding.id
        );
        error!("register_shortcut error: {message}");
        return Err(message);
    }
    Combo::usable(&binding.current_binding).map_err(|message| {
        warn!("register_shortcut validation error: {message}");
        message
    })
}

fn free_shortcut(app: &AppHandle, combo: &Combo) -> Result<Shortcut, String> {
    let shortcut = combo
        .to_string()
        .parse::<Shortcut>()
        .map_err(|error| format!("'{combo}' can't be used as a shortcut: {error}"))?;
    if app.global_shortcut().is_registered(shortcut) {
        let message = format!("Shortcut '{combo}' is already in use");
        warn!("register_shortcut duplicate error: {message}");
        return Err(message);
    }
    Ok(shortcut)
}

pub(super) struct ShortcutInvocation<'a> {
    pub(super) app: &'a AppHandle,
    pub(super) binding_id: &'a str,
    pub(super) shortcut: &'a str,
    pub(super) event: ShortcutEvent,
}

pub(super) fn dispatch_shortcut(invocation: ShortcutInvocation<'_>) {
    let Some(action) = ACTION_MAP.get(invocation.binding_id) else {
        warn!(
            "No action defined for shortcut ID '{}'",
            invocation.binding_id
        );
        return;
    };
    let held = invocation.app.state::<HeldShortcuts>();
    if !is_key_edge(&held, invocation.binding_id, invocation.event) {
        return;
    }
    let execution = shortcut_transition(ShortcutTransition {
        is_one_shot: action.is_one_shot(),
        push_to_talk: get_settings(invocation.app).push_to_talk,
        event: invocation.event,
    });
    execute_action(action.as_ref(), &invocation, execution);
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
        ShortcutExecution::Toggle => {
            toggle_dictation(invocation.app, invocation.binding_id, invocation.shortcut)
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
    let combo = Combo::parse(&binding.current_binding).map_err(|reason| {
        let message = format!(
            "Failed to read shortcut '{}' for unregistration: {reason}",
            binding.current_binding
        );
        error!("unregister_shortcut parse error: {message}");
        message
    })?;
    #[cfg(target_os = "macos")]
    if combo.holds_fn() {
        return app.state::<FnHotkeys>().release(&binding.id, &combo);
    }
    app.global_shortcut()
        .unregister(combo.to_string().as_str())
        .map_err(|e| {
            let message = format!(
                "Failed to unregister shortcut '{}': {e}",
                binding.current_binding
            );
            error!("unregister_shortcut error: {message}");
            message
        })
}

#[cfg(test)]
#[path = "init_tests.rs"]
mod tests;
