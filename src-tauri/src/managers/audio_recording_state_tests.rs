use super::{
    begin_recording_teardown, claim_recording_cancel, claim_recording_stop, is_reserved_recording,
    recording_binding_id, reserve_recording_start, RecordingAttempt, RecordingState, RecordingStop,
};

#[test]
fn active_binding_is_available_to_visible_recording_controls() {
    let active = RecordingState::Recording {
        attempt: RecordingAttempt(1),
        binding_id: "transcribe".to_string(),
    };

    assert_eq!(recording_binding_id(&active), Some("transcribe"));
    assert_eq!(recording_binding_id(&RecordingState::Idle), None);
}

#[test]
fn pending_start_is_available_to_stop_controls() {
    let pending = RecordingState::Starting {
        attempt: RecordingAttempt(1),
        binding_id: "overlay_control".to_string(),
    };

    assert_eq!(recording_binding_id(&pending), Some("overlay_control"));
}

#[test]
fn recording_start_is_reserved_before_microphone_startup() {
    let mut state = RecordingState::Idle;
    let attempt = RecordingAttempt(1);

    assert!(reserve_recording_start(
        &mut state,
        "overlay_control",
        attempt
    ));
    assert_eq!(recording_binding_id(&state), Some("overlay_control"));
    assert!(!reserve_recording_start(
        &mut state,
        "overlay_control",
        RecordingAttempt(2)
    ));
}

#[test]
fn stale_start_cannot_consume_a_new_reservation_with_the_same_binding() {
    let first = RecordingAttempt(1);
    let second = RecordingAttempt(2);
    let mut state = RecordingState::Idle;

    assert!(reserve_recording_start(
        &mut state,
        "overlay_control",
        first
    ));
    state = RecordingState::Idle;
    assert!(reserve_recording_start(
        &mut state,
        "overlay_control",
        second
    ));

    assert!(!is_reserved_recording(&state, "overlay_control", first));
    assert!(is_reserved_recording(&state, "overlay_control", second));
}

#[test]
fn stop_claim_blocks_pending_restart_until_cleanup() {
    let attempt = RecordingAttempt(1);
    let mut state = RecordingState::Starting {
        attempt,
        binding_id: "overlay_control".to_string(),
    };

    let stop = claim_recording_stop(&mut state, "overlay_control");

    assert_eq!(stop, Some(RecordingStop::Pending { attempt }));
    assert!(begin_recording_teardown(
        &mut state,
        "overlay_control",
        attempt
    ));
}

#[test]
fn stop_claim_blocks_restart_until_exact_attempt_owns_teardown() {
    let attempt = RecordingAttempt(2);
    let mut state = RecordingState::Recording {
        attempt,
        binding_id: "overlay_control".to_string(),
    };

    let stop = claim_recording_stop(&mut state, "overlay_control");

    assert_eq!(stop, Some(RecordingStop::Active { attempt }));
    assert!(begin_recording_teardown(
        &mut state,
        "overlay_control",
        attempt
    ));
    assert!(!begin_recording_teardown(
        &mut state,
        "overlay_control",
        RecordingAttempt(1)
    ));
}

#[test]
fn cancellation_has_one_exact_teardown_owner() {
    let attempt = RecordingAttempt(3);
    let mut state = RecordingState::Recording {
        attempt,
        binding_id: "overlay_control".to_string(),
    };

    assert_eq!(claim_recording_cancel(&mut state), Some(attempt));
    assert_eq!(claim_recording_cancel(&mut state), None);
    assert!(matches!(
        state,
        RecordingState::Finalizing {
            attempt: active,
            ..
        } if active == attempt
    ));
}
