use log::error;
use serde::Deserialize;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::utils;

/// Keys the overlay borrows from the focused app while an operation is running — Escape drops the
/// dictation, Enter finishes it exactly as the island's button does.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OverlayKey {
    Cancel,
    Finish,
}

impl OverlayKey {
    fn accelerator(self) -> &'static str {
        match self {
            Self::Cancel => "escape",
            Self::Finish => "enter",
        }
    }

    fn run(self, app: &AppHandle) {
        match self {
            Self::Cancel => utils::cancel_current_operation(app),
            Self::Finish => {
                if let Err(error) =
                    crate::commands::transcription::stop_transcription_from_overlay(app.clone())
                {
                    error!("Enter could not finish the recording: {error}");
                }
            }
        }
    }

    fn shortcut(self) -> Result<Shortcut, String> {
        self.accelerator()
            .parse::<Shortcut>()
            .map_err(|error| format!("Failed to parse the {} key: {error}", self.accelerator()))
    }
}

/// Call when the overlay can act on the key; ours must take precedence over any existing handler.
#[tauri::command]
pub fn hold_overlay_key(app: AppHandle, key: OverlayKey) -> Result<(), String> {
    let shortcut = key.shortcut()?;
    if app.global_shortcut().is_registered(shortcut) {
        let _ = app.global_shortcut().unregister(shortcut);
    }
    app.global_shortcut()
        .on_shortcut(shortcut, move |handle, fired, event| {
            if fired == &shortcut && event.state == ShortcutState::Pressed {
                key.run(handle);
            }
        })
        .map_err(|error| format!("Failed to hold the {} key: {error}", key.accelerator()))
        .inspect_err(|error| error!("{error}"))
}

/// Call when the overlay stops acting on the key — the focused app gets it straight back.
#[tauri::command]
pub fn release_overlay_key(app: AppHandle, key: OverlayKey) -> Result<(), String> {
    let shortcut = key.shortcut()?;
    if !app.global_shortcut().is_registered(shortcut) {
        return Ok(());
    }
    app.global_shortcut()
        .unregister(shortcut)
        .map_err(|error| format!("Failed to release the {} key: {error}", key.accelerator()))
        .inspect_err(|error| error!("{error}"))
}
