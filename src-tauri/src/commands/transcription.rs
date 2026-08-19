use crate::actions::{check_model_readiness, ModelReadiness, ACTION_MAP};
use crate::dictation::CHAT_BINDING_ID;
use crate::managers::audio::AudioRecordingManager;
use crate::managers::transcription::TranscriptionManager;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

const OVERLAY_BINDING_ID: &str = "overlay_control";

fn begin_dictation(app: &AppHandle, binding_id: &'static str) -> Result<(), String> {
    let recording = app.state::<Arc<AudioRecordingManager>>();
    if recording.active_binding_id().is_some() {
        return Err("A recording is already active".to_string());
    }
    let action = ACTION_MAP
        .get("transcribe")
        .ok_or_else(|| "Transcription action is unavailable".to_string())?;
    action.start(app, binding_id, binding_id);
    Ok(())
}

fn end_dictation(app: &AppHandle, binding_id: &'static str) -> Result<(), String> {
    let recording = app.state::<Arc<AudioRecordingManager>>();
    let active = recording
        .active_binding_id()
        .ok_or_else(|| "No recording is active".to_string())?;
    let action = ACTION_MAP
        .get("transcribe")
        .ok_or_else(|| "Transcription action is unavailable".to_string())?;
    action.stop(app, &active, binding_id);
    Ok(())
}

#[tauri::command]
pub(crate) fn start_transcription_from_overlay(app: AppHandle) -> Result<(), String> {
    run_after_focus_release(
        || crate::overlay::release_recording_overlay_focus(&app),
        || begin_dictation(&app, OVERLAY_BINDING_ID),
    )
}

#[tauri::command]
pub(crate) fn stop_transcription_from_overlay(app: AppHandle) -> Result<(), String> {
    run_after_focus_release(
        || crate::overlay::release_recording_overlay_focus(&app),
        || end_dictation(&app, OVERLAY_BINDING_ID),
    )
}

/// Chat keeps the keyboard and the notch: this dictation is composing a message, not filling a caret.
#[tauri::command]
pub(crate) fn start_chat_dictation(app: AppHandle) -> Result<(), String> {
    match check_model_readiness(&app) {
        ModelReadiness::Ready => {}
        ModelReadiness::Blocked(message) | ModelReadiness::Downloading(message) => {
            return Err(message)
        }
    }
    begin_dictation(&app, CHAT_BINDING_ID)
}

#[tauri::command]
pub(crate) fn stop_chat_dictation(app: AppHandle) -> Result<(), String> {
    end_dictation(&app, CHAT_BINDING_ID)
}

#[tauri::command]
pub(crate) fn run_polish_from_overlay(app: AppHandle) -> Result<(), String> {
    run_after_focus_release(
        || crate::overlay::release_recording_overlay_focus(&app),
        || {
            let action = ACTION_MAP
                .get("polish")
                .ok_or_else(|| "Polish action is unavailable".to_string())?;
            action.start(&app, "polish", "overlay_control");
            Ok(())
        },
    )
}

fn run_after_focus_release(
    release_focus: impl FnOnce() -> Result<(), String>,
    run_action: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    release_focus()?;
    run_action()
}

/// Warms models off-thread before likely dictation without blocking IPC.
#[tauri::command]
pub(crate) fn prewarm_models(app: AppHandle) -> Result<(), String> {
    let tm = app.state::<Arc<TranscriptionManager>>().inner().clone();
    std::thread::spawn(move || {
        if let Err(e) = tm.prewarm() {
            log::warn!("UI-triggered prewarm failed: {}", e);
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    #[test]
    fn overlay_action_releases_focus_before_running() {
        let calls = RefCell::new(Vec::new());

        let result = super::run_after_focus_release(
            || {
                calls.borrow_mut().push("release");
                Ok(())
            },
            || {
                calls.borrow_mut().push("action");
                Ok(())
            },
        );

        assert_eq!(result, Ok(()));
        assert_eq!(calls.into_inner(), vec!["release", "action"]);
    }

    #[test]
    fn overlay_action_stops_when_focus_release_fails() {
        let action_ran = Cell::new(false);

        let result = super::run_after_focus_release(
            || Err("focus release failed".to_string()),
            || {
                action_ran.set(true);
                Ok(())
            },
        );

        assert_eq!(result, Err("focus release failed".to_string()));
        assert!(!action_ran.get());
    }
}
