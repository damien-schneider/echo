//! Shortcuts register before any window exists, so a combo already held by another process parks its failure here.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub const SHORTCUT_REGISTRATION_FAILED_EVENT: &str = "shortcut-registration-failed";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutFailure {
    pub binding_id: String,
    pub binding: String,
    pub reason: String,
}

#[derive(Default)]
pub struct ShortcutFailures(Mutex<Vec<ShortcutFailure>>);

impl ShortcutFailures {
    fn entries(&self) -> std::sync::MutexGuard<'_, Vec<ShortcutFailure>> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// One failure per binding — a retry replaces the previous one.
    pub fn record(&self, failure: ShortcutFailure) {
        let mut entries = self.entries();
        entries.retain(|entry| entry.binding_id != failure.binding_id);
        entries.push(failure);
    }

    pub fn clear(&self, binding_id: &str) {
        self.entries()
            .retain(|entry| entry.binding_id != binding_id);
    }

    pub fn list(&self) -> Vec<ShortcutFailure> {
        self.entries().clone()
    }
}

pub fn record(app: &AppHandle, failure: ShortcutFailure) {
    let Some(state) = app.try_state::<ShortcutFailures>() else {
        return;
    };
    state.record(failure.clone());
    let _ = app.emit(SHORTCUT_REGISTRATION_FAILED_EVENT, failure);
}

pub fn clear(app: &AppHandle, binding_id: &str) {
    if let Some(state) = app.try_state::<ShortcutFailures>() {
        state.clear(binding_id);
    }
}

/// A window that boots after registration reads what it missed.
#[tauri::command]
pub fn get_shortcut_failures(app: AppHandle) -> Vec<ShortcutFailure> {
    app.try_state::<ShortcutFailures>()
        .map(|state| state.list())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{ShortcutFailure, ShortcutFailures};

    fn failure(binding_id: &str, reason: &str) -> ShortcutFailure {
        ShortcutFailure {
            binding_id: binding_id.to_string(),
            binding: "option+space".to_string(),
            reason: reason.to_string(),
        }
    }

    #[test]
    fn a_new_app_has_nothing_to_report() {
        assert_eq!(ShortcutFailures::default().list(), Vec::new());
    }

    #[test]
    fn retrying_a_binding_replaces_its_previous_failure() {
        let failures = ShortcutFailures::default();

        failures.record(failure("transcribe", "first"));
        failures.record(failure("transcribe", "second"));

        assert_eq!(failures.list(), vec![failure("transcribe", "second")]);
    }

    #[test]
    fn a_registration_that_works_drops_only_its_own_failure() {
        let failures = ShortcutFailures::default();
        failures.record(failure("transcribe", "taken"));
        failures.record(failure("polish", "taken"));

        failures.clear("transcribe");

        assert_eq!(failures.list(), vec![failure("polish", "taken")]);
    }
}
