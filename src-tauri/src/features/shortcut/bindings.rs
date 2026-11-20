//! Wayland routes every binding through the XDG Portal; other platforms register through `init`.

use std::collections::HashMap;

#[cfg(target_os = "linux")]
use log::{debug, info};
use log::{error, warn};
use tauri::AppHandle;

use super::combo::Combo;
use super::failures;
use super::init::{
    claim_shortcut, holds_binding, register_shortcut, registration_refusal, unregister_shortcut,
};
use crate::actions::ACTION_MAP;
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
    match (Combo::parse(left), Combo::parse(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => left.eq_ignore_ascii_case(right),
    }
}

fn plan_rebind(
    bindings: &HashMap<String, ShortcutBinding>,
    id: &str,
    raw: &str,
) -> Result<Rebind, String> {
    let previous = bindings
        .get(id)
        .cloned()
        .ok_or_else(|| format!("Binding with id '{id}' not found"))?;
    let combo = Combo::usable(raw)?.to_string();
    let owner = bindings
        .iter()
        .find(|(other_id, other)| *other_id != id && is_same_combo(&other.current_binding, &combo));
    if let Some((_, owner)) = owner {
        return Err(format!("'{combo}' is already the {} shortcut", owner.name));
    }
    let keeps_combo = is_same_combo(&previous.current_binding, &combo);
    let updated = ShortcutBinding {
        current_binding: combo,
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
    claim_shortcut(app, binding.clone())
        .map_err(|reason| registration_refusal(&binding.current_binding, &reason))?;
    failures::clear(app, &binding.id);
    Ok(())
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
    let holds_previous = holds_binding(app, &rebind.previous);
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

/// Awaits the Wayland portal so its authorization dialog can surface. Resolves to the combo as stored.
#[tauri::command]
pub async fn change_binding(app: AppHandle, id: String, binding: String) -> Result<String, String> {
    let rebind = plan_rebind(&settings::get_bindings(&app), &id, &binding).map_err(|error| {
        warn!("change_binding rejected '{binding}' for '{id}': {error}");
        error
    })?;
    let stored = rebind.updated.current_binding.clone();

    #[cfg(target_os = "linux")]
    if super::wayland::is_wayland_session() {
        return rebind_through_portal(&app, rebind).await.map(|()| stored);
    }

    rebind_registered_shortcut(&app, rebind).map(|()| stored)
}

#[tauri::command]
pub async fn reset_binding(app: AppHandle, id: String) -> Result<String, String> {
    let binding =
        settings::get_stored_binding(&app, &id).ok_or_else(|| format!("Unknown binding '{id}'"))?;
    change_binding(app, id, binding.default_binding).await
}

/// Every action stays off while keys are recorded, so another binding's combo is recorded and refused instead of fired. No-op on Wayland.
#[tauri::command]
pub fn suspend_shortcuts(app: AppHandle) {
    #[cfg(target_os = "linux")]
    if super::wayland::is_wayland_session() {
        debug!("[Shortcuts] suspend_shortcuts: Wayland session, no-op");
        return;
    }

    for binding in settings::get_bindings(&app).into_values() {
        if holds_binding(&app, &binding) {
            if let Err(error) = unregister_shortcut(&app, binding) {
                error!("suspend_shortcuts: {error}");
            }
        }
    }
}

/// No-op on Wayland — `change_binding` re-applies there.
#[tauri::command]
pub fn resume_shortcuts(app: AppHandle) {
    #[cfg(target_os = "linux")]
    if super::wayland::is_wayland_session() {
        debug!("[Shortcuts] resume_shortcuts: Wayland session, no-op");
        return;
    }

    for binding in settings::get_bindings(&app).into_values() {
        if ACTION_MAP.contains_key(&binding.id) && !holds_binding(&app, &binding) {
            let _ = register_shortcut(&app, binding);
        }
    }
}

#[cfg(test)]
#[path = "bindings_tests.rs"]
mod tests;
