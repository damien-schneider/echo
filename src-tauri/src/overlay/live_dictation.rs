use crate::managers::audio::{AudioRecordingManager, CapturePhase};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// An expired notice gives the island back to the dictation it covered, or hides it when there is none.
pub(super) fn end_notice(app_handle: &AppHandle) {
    let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") else {
        return;
    };
    let _ = match phase_under_notice(app_handle) {
        Some(phase) => overlay_window.emit("show-overlay", phase),
        None => overlay_window.emit("hide-overlay", ()),
    };
}

fn phase_under_notice(app_handle: &AppHandle) -> Option<&'static str> {
    if crate::dictation::routes_to_chat() {
        return None;
    }
    let recording = app_handle.try_state::<Arc<AudioRecordingManager>>()?;
    phase_for(
        recording.capture_phase(),
        crate::actions::previous_dictation_is_settling(),
    )
}

fn phase_for(capture: CapturePhase, is_settling: bool) -> Option<&'static str> {
    match capture {
        CapturePhase::Opening => Some("preparing"),
        CapturePhase::Capturing => Some("recording"),
        CapturePhase::Closing => Some("transcribing"),
        CapturePhase::Idle if is_settling => Some("transcribing"),
        CapturePhase::Idle => None,
    }
}

#[cfg(test)]
mod tests {
    use super::phase_for;
    use crate::managers::audio::CapturePhase;

    #[test]
    fn a_notice_over_a_live_recording_gives_the_island_back_to_the_recording() {
        assert_eq!(phase_for(CapturePhase::Capturing, false), Some("recording"));
    }

    #[test]
    fn a_notice_while_the_microphone_opens_returns_to_preparing() {
        assert_eq!(phase_for(CapturePhase::Opening, false), Some("preparing"));
    }

    #[test]
    fn a_notice_while_the_text_is_still_being_produced_returns_to_transcribing() {
        assert_eq!(
            phase_for(CapturePhase::Closing, false),
            Some("transcribing")
        );
        assert_eq!(phase_for(CapturePhase::Idle, true), Some("transcribing"));
    }

    #[test]
    fn a_notice_with_no_dictation_under_it_hides_the_island() {
        assert_eq!(phase_for(CapturePhase::Idle, false), None);
    }
}
