//! Core shortcut initialization and registration logic.

use log::{error, warn};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::actions::ACTION_MAP;
use crate::settings::{self, get_settings, ShortcutBinding};
use crate::ManagedToggleState;

/// Initialize all shortcuts from settings.
/// Only registers shortcuts that have corresponding actions in ACTION_MAP.
pub fn init_shortcuts(app: &AppHandle) {
    let settings = settings::load_or_create_app_settings(app);

    for (_id, binding) in settings.bindings {
        // Skip bindings that don't have corresponding actions
        if !ACTION_MAP.contains_key(&binding.id) {
            warn!(
                "Skipping binding '{}' - no action defined in ACTION_MAP",
                binding.id
            );
            continue;
        }
        if let Err(e) = register_shortcut(app, binding) {
            error!("Failed to register shortcut {} during init: {}", _id, e);
        }
    }
}

/// Determine whether a shortcut string contains at least one non-modifier key.
/// We allow single non-modifier keys (e.g. "f5" or "space") but disallow
/// modifier-only combos (e.g. "ctrl" or "ctrl+shift").
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

/// Register a single shortcut binding.
pub fn register_shortcut(app: &AppHandle, binding: ShortcutBinding) -> Result<(), String> {
    // Ensure the binding has a corresponding action in ACTION_MAP
    if !ACTION_MAP.contains_key(&binding.id) {
        let error_msg = format!(
            "No action defined in ACTION_MAP for binding ID '{}'",
            binding.id
        );
        error!("register_shortcut error: {}", error_msg);
        return Err(error_msg);
    }

    // Validate human-level rules first
    if let Err(e) = validate_shortcut_string(&binding.current_binding) {
        warn!(
            "register_shortcut validation error for binding '{}': {}",
            binding.current_binding, e
        );
        return Err(e);
    }

    // Parse shortcut and return error if it fails
    let shortcut = match binding.current_binding.parse::<Shortcut>() {
        Ok(s) => s,
        Err(e) => {
            let error_msg = format!(
                "Failed to parse shortcut '{}': {}",
                binding.current_binding, e
            );
            error!("register_shortcut parse error: {}", error_msg);
            return Err(error_msg);
        }
    };

    // Prevent duplicate registrations that would silently shadow one another
    if app.global_shortcut().is_registered(shortcut) {
        let error_msg = format!("Shortcut '{}' is already in use", binding.current_binding);
        warn!("register_shortcut duplicate error: {}", error_msg);
        return Err(error_msg);
    }

    // Clone binding.id for use in the closure
    let binding_id_for_closure = binding.id.clone();

    app.global_shortcut()
        .on_shortcut(shortcut, move |ah, scut, event| {
            if scut == &shortcut {
                let shortcut_string = scut.into_string();
                let settings = get_settings(ah);

                if let Some(action) = ACTION_MAP.get(&binding_id_for_closure) {
                    if settings.push_to_talk {
                        if event.state == ShortcutState::Pressed {
                            action.start(ah, &binding_id_for_closure, &shortcut_string);
                        } else if event.state == ShortcutState::Released {
                            action.stop(ah, &binding_id_for_closure, &shortcut_string);
                        }
                    } else if event.state == ShortcutState::Pressed {
                        let toggle_state_manager = ah.state::<ManagedToggleState>();

                        let mut states = toggle_state_manager
                            .lock()
                            .expect("Failed to lock toggle state manager");

                        let is_currently_active = states
                            .active_toggles
                            .entry(binding_id_for_closure.clone())
                            .or_insert(false);

                        if *is_currently_active {
                            action.stop(ah, &binding_id_for_closure, &shortcut_string);
                            *is_currently_active = false;
                        } else {
                            action.start(ah, &binding_id_for_closure, &shortcut_string);
                            *is_currently_active = true;
                        }
                    }
                } else {
                    warn!(
                        "No action defined in ACTION_MAP for shortcut ID '{}'. Shortcut: '{}', State: {:?}",
                        binding_id_for_closure, shortcut_string, event.state
                    );
                }
            }
        })
        .map_err(|e| {
            let error_msg = format!(
                "Couldn't register shortcut '{}': {}",
                binding.current_binding, e
            );
            error!("register_shortcut registration error: {}", error_msg);
            error_msg
        })?;

    Ok(())
}

/// Unregister a single shortcut binding.
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
