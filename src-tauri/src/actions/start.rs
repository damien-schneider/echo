//! From a press to a live recording: the guards, the reservation, and what the user is told when either refuses.

use super::{
    check_model_readiness, is_current_operation, previous_dictation_is_settling,
    should_apply_start_feedback, OPERATION_GENERATION,
};
use crate::audio_feedback::{play_feedback_sound_blocking, SoundType};
use crate::commands::audio::{microphone_permission_status, open_microphone_settings};
use crate::features::polish::manager::PolishManager;
use crate::managers::audio::{AudioRecordingManager, RecordingAttempt};
use crate::managers::transcription::TranscriptionManager;
use crate::model_pass::routed_model_pass;
use crate::overlay::{
    mark_recording_live, show_preparing_overlay, show_tool_overlay, show_warning_overlay,
};
use crate::settings::get_settings;
use crate::tray::{change_tray_icon, TrayIconState};
use log::{info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// `Err` repeats what the island already told the user, for callers with their own place to say it.
pub(crate) fn start_dictation(app: &AppHandle, binding_id: &str) -> Result<(), String> {
    let start_time = Instant::now();
    refuse_if_blocked(app).inspect_err(|reason| warn!("Dictation not started: {reason}"))?;
    let guards_passed = start_time.elapsed();

    app.state::<Arc<TranscriptionManager>>()
        .initiate_model_load();
    let recording = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
    let Some(attempt) = recording.reserve_start(binding_id, || {
        OPERATION_GENERATION
            .fetch_add(1, Ordering::SeqCst)
            .wrapping_add(1)
    }) else {
        warn!("Dictation not started: another recording is active");
        return Err("A recording is already active".to_string());
    };
    let reserved = start_time.elapsed();
    crate::dictation::begin(binding_id);
    change_tray_icon(app, TrayIconState::Recording);
    if !crate::dictation::routes_to_chat() {
        show_preparing_overlay(app);
    }
    info!(
        "start: overlay show requested at +{:?} (guards +{guards_passed:?}, reserved +{reserved:?}, on shortcut callback thread)",
        start_time.elapsed()
    );
    crate::managers::tts::stop_speaking(app);
    warm_up_model_pass(app);
    ReservedStart {
        app: app.clone(),
        attempt,
        binding_id: binding_id.to_string(),
        recording,
    }
    .open();
    Ok(())
}

fn refuse_if_blocked(app: &AppHandle) -> Result<(), String> {
    if crate::is_file_transcription_active() {
        return Err(warned(
            app,
            "File transcription in progress. Please wait...",
        ));
    }
    if let Some(block) = check_model_readiness(app).report_block(app) {
        return Err(block);
    }
    require_microphone_access(app)?;
    if previous_dictation_is_settling() {
        return Err(warned(
            app,
            "Still finishing the previous dictation — try again in a moment",
        ));
    }
    Ok(())
}

fn warned(app: &AppHandle, message: &str) -> String {
    show_warning_overlay(app, message);
    message.to_string()
}

fn warm_up_model_pass(app: &AppHandle) {
    if routed_model_pass(app).is_none() {
        return;
    }
    if let Some(polish) = app.try_state::<Arc<PolishManager>>() {
        polish.inner().warm_up_for_post_processing();
    }
}

struct ReservedStart {
    app: AppHandle,
    attempt: RecordingAttempt,
    binding_id: String,
    recording: Arc<AudioRecordingManager>,
}

impl ReservedStart {
    /// Off the shortcut thread: a device can take seconds to open, and the release has to get through meanwhile.
    fn open(self) {
        std::thread::spawn(move || {
            let opening = Instant::now();
            if !self
                .recording
                .start_reserved_recording(&self.binding_id, self.attempt)
            {
                report_failed_start(&self.app, self.attempt.operation_generation());
                return;
            }
            info!(
                "start: try_start_recording (mic open + worker) took {:?} (off-thread)",
                opening.elapsed()
            );
            self.announce();
        });
    }

    fn announce(self) {
        let delay = if get_settings(&self.app).always_on_microphone {
            Duration::ZERO
        } else {
            Duration::from_millis(100)
        };
        std::thread::sleep(delay);
        let generation = self.attempt.operation_generation();
        if !should_apply_start_feedback(
            OPERATION_GENERATION.load(Ordering::SeqCst),
            generation,
            self.recording.is_attempt_active(self.attempt),
        ) {
            return;
        }
        if !crate::dictation::routes_to_chat() {
            mark_recording_live(&self.app);
        }
        play_feedback_sound_blocking(&self.app, SoundType::Start);
        if is_current_operation(OPERATION_GENERATION.load(Ordering::SeqCst), generation) {
            self.recording.apply_mute_if_active(self.attempt);
        }
    }
}

/// A moved generation means the user stopped or cancelled first: that is not a failure to report.
fn report_failed_start(app: &AppHandle, generation: u64) {
    if !is_current_operation(OPERATION_GENERATION.load(Ordering::SeqCst), generation) {
        return;
    }
    crate::dictation::abandon(app);
    show_warning_overlay(app, "Microphone unavailable — check your input device");
    change_tray_icon(app, TrayIconState::Idle);
}

static ACCESS_REQUEST_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

const MICROPHONE_OFF: &str = "Microphone is off for Echo — enable it in System Settings";

/// A dictation without microphone access only records silence — resolve access before capture.
fn require_microphone_access(app: &AppHandle) -> Result<(), String> {
    let status = microphone_permission_status();
    if status == "authorized" {
        return Ok(());
    }
    warn!("Microphone access is {status}");
    let is_denied = status == "denied";
    let message = if is_denied {
        MICROPHONE_OFF
    } else {
        "Allow microphone access in the dialog to dictate"
    };
    show_warning_overlay(app, message);
    if !ACCESS_REQUEST_IN_FLIGHT.swap(true, Ordering::AcqRel) {
        let app = app.clone();
        std::thread::spawn(move || {
            resolve_microphone_access(&app, is_denied);
            ACCESS_REQUEST_IN_FLIGHT.store(false, Ordering::Release);
        });
    }
    Err(message.to_string())
}

/// Never starts the dictation itself: by the time access is granted the key is long released.
fn resolve_microphone_access(app: &AppHandle, is_denied: bool) {
    if !is_denied {
        let _ = tauri::async_runtime::block_on(
            tauri_plugin_macos_permissions::request_microphone_permission(),
        );
        if dialog_granted_access() {
            info!("Microphone access granted");
            show_tool_overlay(app, "Microphone enabled — press the shortcut again");
            return;
        }
        show_warning_overlay(app, MICROPHONE_OFF);
    }
    if let Err(error) = open_microphone_settings(app.clone()) {
        warn!("{error}");
    }
}

/// The permission dialog has no callback: its answer only shows up in the status.
fn dialog_granted_access() -> bool {
    for _ in 0..60 {
        match microphone_permission_status() {
            "authorized" => return true,
            "denied" => return false,
            _ => std::thread::sleep(Duration::from_millis(500)),
        }
    }
    false
}
