use super::{covered_modes, render_mode, settle_mode, stage_mode, SurfaceModeState};
use crate::overlay::layout::RecordingOverlayMode;

const IDLE_HUD: SurfaceModeState = SurfaceModeState {
    pending: None,
    settled: Some(RecordingOverlayMode::Compact),
};

const SILENT: SurfaceModeState = SurfaceModeState {
    pending: None,
    settled: None,
};

#[test]
fn a_transition_keeps_the_outgoing_mode_covered() {
    assert_eq!(
        covered_modes(IDLE_HUD, RecordingOverlayMode::Actions),
        vec![RecordingOverlayMode::Compact]
    );
}

#[test]
fn an_interrupted_transition_keeps_every_in_flight_mode_covered() {
    let state = SurfaceModeState {
        pending: Some(RecordingOverlayMode::Chat),
        settled: Some(RecordingOverlayMode::Recording),
    };

    assert_eq!(
        covered_modes(state, RecordingOverlayMode::Panel),
        vec![RecordingOverlayMode::Recording, RecordingOverlayMode::Chat]
    );
}

#[test]
fn rendering_the_settled_mode_covers_nothing_extra() {
    let state = stage_mode(IDLE_HUD, RecordingOverlayMode::Compact);

    assert!(covered_modes(state, RecordingOverlayMode::Compact).is_empty());
}

#[test]
fn settle_accepts_only_the_current_pending_mode() {
    let state = stage_mode(SILENT, RecordingOverlayMode::Chat);

    assert_eq!(settle_mode(state, RecordingOverlayMode::Panel), None);
    assert_eq!(
        settle_mode(state, RecordingOverlayMode::Chat),
        Some(SurfaceModeState {
            pending: None,
            settled: Some(RecordingOverlayMode::Chat),
        })
    );
}

/// A window with nothing settled and nothing staged draws nothing at all: the
/// notification stays off screen until activity asks for it.
#[test]
fn a_silent_window_renders_no_mode_until_one_is_staged() {
    assert_eq!(render_mode(SILENT), None);
    assert!(covered_modes(SILENT, RecordingOverlayMode::Recording).is_empty());
    assert_eq!(
        render_mode(stage_mode(SILENT, RecordingOverlayMode::Recording)),
        Some(RecordingOverlayMode::Recording)
    );
}

/// The staged mode is what the webview is animating towards, so it wins over
/// the settled one for as long as the morph lasts.
#[test]
fn the_staged_mode_is_the_one_being_drawn() {
    let state = stage_mode(IDLE_HUD, RecordingOverlayMode::Actions);

    assert_eq!(render_mode(state), Some(RecordingOverlayMode::Actions));
    assert_eq!(
        render_mode(settle_mode(state, RecordingOverlayMode::Actions).expect("settles")),
        Some(RecordingOverlayMode::Actions)
    );
}
