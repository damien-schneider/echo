use crate::actions::{OPERATION_GENERATION, TRANSCRIPTION_TASK};
use crate::features::polish::manager::PolishManager;
use crate::managers::audio::AudioRecordingManager;
use log::info;
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

    let audio_manager = app.state::<Arc<AudioRecordingManager>>();
    audio_manager.cancel_recording();

    crate::dictation::abandon(app);
    hide_recording_overlay(app);
    change_tray_icon(app, crate::tray::TrayIconState::Idle);

    info!("Operation cancellation completed - returned to idle state");
}
