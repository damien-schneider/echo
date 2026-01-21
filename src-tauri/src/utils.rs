use crate::managers::audio::AudioRecordingManager;
use crate::ManagedToggleState;
use log::{info, warn};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

// Re-export all utility modules for easy access
// pub use crate::audio_feedback::*;
pub use crate::clipboard::*;
pub use crate::overlay::*;
pub use crate::tray::*;

/// Centralized cancellation function that can be called from anywhere in the app.
/// Handles cancelling both recording and transcription operations and updates UI state.
pub fn cancel_current_operation(app: &AppHandle) {
    info!("Initiating operation cancellation...");

    // Cancel any ongoing recording FIRST (before resetting toggle states)
    // This ensures the audio stream is stopped before any cleanup
    let audio_manager = app.state::<Arc<AudioRecordingManager>>();
    audio_manager.cancel_recording();

    // Reset all shortcut toggle states WITHOUT calling stop actions
    // We don't want to trigger transcription during cancellation
    let toggle_state_manager = app.state::<ManagedToggleState>();
    if let Ok(mut states) = toggle_state_manager.lock() {
        // For each currently active toggle, just reset its state
        let active_bindings: Vec<String> = states
            .active_toggles
            .iter()
            .filter(|(_, &is_active)| is_active)
            .map(|(binding_id, _)| binding_id.clone())
            .collect();

        for binding_id in active_bindings {
            info!("Resetting toggle state for binding: {}", binding_id);
            // Just reset the toggle state - don't call action.stop()
            // because that would trigger a transcription
            if let Some(is_active) = states.active_toggles.get_mut(&binding_id) {
                *is_active = false;
            }
        }
    } else {
        warn!("Warning: Failed to lock toggle state manager during cancellation");
    }

    // Hide overlay and update tray icon to idle state
    hide_recording_overlay(app);
    change_tray_icon(app, crate::tray::TrayIconState::Idle);

    info!("Operation cancellation completed - returned to idle state");
}
