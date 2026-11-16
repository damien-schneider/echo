//! Wayland routes every binding through the XDG Portal; other platforms use the global shortcut plugin.

use std::collections::HashMap;

#[cfg(target_os = "linux")]
use log::{debug, info};
use log::{error, warn};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use super::failures;
use super::init::{register_shortcut, unregister_shortcut, validate_shortcut_string};
use crate::settings::{self, ShortcutBinding};

#[derive(Debug)]
struct Rebind {
    previous: ShortcutBinding,
    updated: ShortcutBinding,
    keeps_combo: bool,
}

impl Rebind {
    fn needs_registration(&self, holds_previous: bool) -> bool {
        !(self.keeps_combo && holds_previous)
    }
}

fn is_same_combo(left: &str, right: &str) -> bool {
    match (left.parse::<Shortcut>(), right.parse::<Shortcut>()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left.eq_ignore_ascii_case(right),
    }
}

fn plan_rebind(
    bindings: &HashMap<String, ShortcutBinding>,
    id: &str,
    combo: &str,
) -> Result<Rebind, String> {
    let previous = bindings
        .get(id)
        .cloned()
        .ok_or_else(|| format!("Binding with id '{id}' not found"))?;
    validate_shortcut_string(combo)?;
    let owner = bindings
        .iter()
        .find(|(other_id, other)| *other_id != id && is_same_combo(&other.current_binding, combo));
    if let Some((_, owner)) = owner {
        return Err(format!("'{combo}' is already the {} shortcut", owner.name));
    }
    let keeps_combo = is_same_combo(&previous.current_binding, combo);
    let updated = ShortcutBinding {
        current_binding: combo.to_string(),
        ..previous.clone()
    };
    Ok(Rebind {
        previous,
        updated,
        keeps_combo,
    })
}

fn persist_binding(app: &AppHandle, binding: ShortcutBinding) {
    settings::update_settings(app, |stored| {
        stored.bindings.insert(binding.id.clone(), binding);
    });
}

fn claim_combo(app: &AppHandle, binding: &ShortcutBinding) -> Result<(), String> {
    let combo = &binding.current_binding;
    combo
        .parse::<Shortcut>()
        .map_err(|error| format!("'{combo}' is not a usable shortcut: {error}"))?;
    register_shortcut(app, binding.clone())
}

fn restore_previous_combo(app: &AppHandle, rebind: Rebind, holds_previous: bool) {
    if holds_previous {
        failures::clear(app, &rebind.previous.id);
        return;
    }
    if rebind.keeps_combo {
        return;
    }
    if let Err(error) = register_shortcut(app, rebind.previous) {
        error!("change_binding could not restore the previous shortcut: {error}");
    }
}

/// Claims the new combo before anything is stored or released, so a refusal leaves the binding as it was.
fn rebind_registered_shortcut(app: &AppHandle, rebind: Rebind) -> Result<(), String> {
    let holds_previous = app
        .global_shortcut()
        .is_registered(rebind.previous.current_binding.as_str());
    if rebind.needs_registration(holds_previous) {
        if let Err(error) = claim_combo(app, &rebind.updated) {
            restore_previous_combo(app, rebind, holds_previous);
            return Err(error);
        }
    }
    let Rebind {
        previous,
        updated,
        keeps_combo,
    } = rebind;
    persist_binding(app, updated);
    if holds_previous && !keeps_combo {
        if let Err(error) = unregister_shortcut(app, previous) {
            error!("change_binding could not release the previous shortcut: {error}");
        }
    }
    Ok(())
}

/// The portal reads the combo back from settings, so it is stored first and restored if the dialog cannot open.
#[cfg(target_os = "linux")]
async fn rebind_through_portal(app: &AppHandle, rebind: Rebind) -> Result<(), String> {
    let Rebind {
        previous, updated, ..
    } = rebind;
    info!(
        "[Shortcuts] Wayland: opening configure dialog for '{}'",
        updated.id
    );
    persist_binding(app, updated);
    match super::wayland::request_configure(app).await {
        Ok(()) => Ok(()),
        Err(error) => {
            error!("[Shortcuts] Failed to open Wayland configure dialog: {error}");
            persist_binding(app, previous);
            Err(format!(
                "Could not open shortcut configuration. Ensure the Global Shortcuts portal is available (GNOME 45+ / KDE Plasma 6+). Details: {error}"
            ))
        }
    }
}

/// Awaits the Wayland portal so its authorization dialog can surface.
#[tauri::command]
pub async fn change_binding(app: AppHandle, id: String, binding: String) -> Result<(), String> {
    let rebind = plan_rebind(&settings::get_bindings(&app), &id, &binding).map_err(|error| {
        warn!("change_binding rejected '{binding}' for '{id}': {error}");
        error
    })?;

    #[cfg(target_os = "linux")]
    if super::wayland::is_wayland_session() {
        return rebind_through_portal(&app, rebind).await;
    }

    rebind_registered_shortcut(&app, rebind)
}

#[tauri::command]
pub async fn reset_binding(app: AppHandle, id: String) -> Result<(), String> {
    let binding =
        settings::get_stored_binding(&app, &id).ok_or_else(|| format!("Unknown binding '{id}'"))?;
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

    let Some(binding) = settings::get_stored_binding(&app, &id) else {
        return Ok(());
    };
    if app
        .global_shortcut()
        .is_registered(binding.current_binding.as_str())
    {
        return Ok(());
    }
    register_shortcut(&app, binding)
}

#[cfg(test)]
#[path = "bindings_tests.rs"]
mod tests;
