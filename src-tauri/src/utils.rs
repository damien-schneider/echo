use crate::actions::{OPERATION_GENERATION, TRANSCRIPTION_TASK};
use crate::features::polish::manager::PolishManager;
use crate::managers::audio::AudioRecordingManager;
use crate::ManagedToggleState;
use log::{info, warn};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub(crate) use crate::overlay::*;
pub use crate::tray::*;

pub fn cancel_current_operation(app: &AppHandle) {
    info!("Initiating operation cancellation...");

    // bump generation so in-flight stop/transcription tasks see themselves as stale
    OPERATION_GENERATION.fetch_add(1, Ordering::SeqCst);
    if let Some(manager) = app.try_state::<Arc<PolishManager>>() {
        manager.cancel();
    }

    if let Ok(mut task) = TRANSCRIPTION_TASK.lock() {
        if let Some(handle) = task.take() {
            handle.abort();
        }
    }

    // stream must stop before toggle state is touched
    let audio_manager = app.state::<Arc<AudioRecordingManager>>();
    audio_manager.cancel_recording();

    let toggle_state_manager = app.state::<ManagedToggleState>();
    if let Ok(mut states) = toggle_state_manager.lock() {
        let active_bindings: Vec<String> = states
            .active_toggles
            .iter()
            .filter(|(_, &is_active)| is_active)
            .map(|(binding_id, _)| binding_id.clone())
            .collect();

        for binding_id in active_bindings {
            info!("Resetting toggle state for binding: {}", binding_id);
            // no action.stop() — that would kick off a transcription
            if let Some(is_active) = states.active_toggles.get_mut(&binding_id) {
                *is_active = false;
            }
        }
    } else {
        warn!("Warning: Failed to lock toggle state manager during cancellation");
    }

    crate::dictation::abandon(app);
    hide_recording_overlay(app);
    change_tray_icon(app, crate::tray::TrayIconState::Idle);

    info!("Operation cancellation completed - returned to idle state");
}
