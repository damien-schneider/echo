use crate::managers::audio::{AudioRecordingManager, CapturePhase};
use crate::settings::{self, OverlayPosition};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

pub(super) const RECORDING: &str = "recording";

/// An expired notice gives the island back to the dictation it covered, or hides it when there is none.
pub(super) fn end_notice(app_handle: &AppHandle) {
    let _ = match shown_phase(app_handle) {
        Some(phase) => app_handle.emit("show-overlay", phase),
        None => app_handle.emit("hide-overlay", ()),
    };
}

/// The dictation the island is drawing right now — none while chat owns it or the overlay is hidden.
pub(super) fn shown_phase(app_handle: &AppHandle) -> Option<&'static str> {
    if crate::dictation::routes_to_chat() {
        return None;
    }
    if settings::get_settings(app_handle).overlay_position == OverlayPosition::None {
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
        CapturePhase::Capturing => Some(RECORDING),
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
