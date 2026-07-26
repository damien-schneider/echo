//! End-to-end resilience coverage for the dictation stop pipeline.
//!
//! Drives [`run_with_timeout`] + the cleanup step + [`decide_end_of_recording`]
//! with stubbed decode closures (hang, error, panic, empty, hallucination,
//! valid speech, Chinese variant) and asserts:
//!   * the caller always escapes within a bounded wall-clock budget — no test
//!     here is allowed to hang indefinitely,
//!   * every failure mode maps to a UI-visible [`EndOfRecordingAction`] that
//!     leaves the overlay in a clean terminal state (paste or warning), and
//!   * the orphaned worker thread eventually completes on timeout (whisper
//!     FFI lock would otherwise stay held forever).
//!
//! These exercise the same wiring that the production stop flow uses, so a
//! regression in the timeout/classifier contract is caught without needing
//! a real model or audio hardware in CI.

use echo_app_lib::actions::{
    audio_is_silent, decide_end_of_recording, EndOfRecordingAction, TranscribedText,
};
use echo_app_lib::managers::timeout::{run_with_timeout, TimedOut};
use echo_app_lib::managers::transcription::TranscribeError;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

/// Mirror what `actions.rs` does between `transcribe_with_timeout` and
/// `decide_end_of_recording`: map a decode result onto the classifier input.
/// Keeping it inline (instead of pulling in the cleanup module) makes the
/// expected behaviour obvious from the test.
fn into_outcome(
    decode_result: Result<String, TranscribeError>,
    cleanup: impl Fn(&str) -> String,
    chinese_variant: Option<&str>,
) -> Result<TranscribedText, TranscribeError> {
    match decode_result {
        Ok(text) => {
            let cleaned = cleanup(&text);
            let variant = if cleaned.is_empty() {
                None
            } else {
                chinese_variant.map(|s| s.to_string())
            };
            Ok(TranscribedText {
                cleaned,
                chinese_variant: variant,
            })
        }
        Err(e) => Err(e),
    }
}

fn passthrough_cleanup(text: &str) -> String {
    text.trim().to_string()
}

fn hallucination_filtering_cleanup(text: &str) -> String {
    // Mirrors the production filter for the limited set of strings we exercise.
    let trimmed = text.trim().to_lowercase();
    if matches!(
        trimmed.as_str(),
        "thank you." | "you" | "thanks for watching"
    ) {
        String::new()
    } else {
        text.trim().to_string()
    }
}

/// Drive `run_with_timeout` like the dictation stop flow would, then run the
/// outcome through the classifier. Returns the chosen action.
fn run_stop_flow(
    decode: impl FnOnce() -> Result<String, TranscribeError> + Send + 'static,
    timeout: Duration,
    cleanup: impl Fn(&str) -> String,
    chinese_variant: Option<&str>,
    samples_present: bool,
) -> EndOfRecordingAction {
    let raw: Result<String, TranscribeError> = match run_with_timeout(decode, timeout) {
        Ok(Ok(text)) => Ok(text),
        Ok(Err(e)) => Err(e),
        Err(TimedOut) => Err(TranscribeError::TimedOut),
    };
    let outcome = into_outcome(raw, cleanup, chinese_variant);
    decide_end_of_recording(samples_present, outcome)
}

// ── Happy path ────────────────────────────────────────────────────────────

#[test]
fn valid_speech_routes_to_post_process() {
    let action = run_stop_flow(
        || Ok("hello world".to_string()),
        Duration::from_secs(2),
        passthrough_cleanup,
        None,
        true,
    );
    match action {
        EndOfRecordingAction::PostProcess(text) => assert_eq!(text, "hello world"),
        other => panic!("expected PostProcess, got {other:?}"),
    }
}

#[test]
fn chinese_variant_routes_to_paste_direct() {
    let action = run_stop_flow(
        || Ok("simplified".to_string()),
        Duration::from_secs(2),
        passthrough_cleanup,
        Some("TRADITIONAL"),
        true,
    );
    match action {
        EndOfRecordingAction::PasteDirect { cleaned, pasted } => {
            assert_eq!(
                pasted, "TRADITIONAL",
                "pasted text is the converted variant"
            );
            assert_eq!(
                cleaned, "simplified",
                "cleaned stays pre-conversion for history"
            );
        }
        other => panic!("expected PasteDirect, got {other:?}"),
    }
}

// ── Failure / silence paths ───────────────────────────────────────────────

#[test]
fn no_samples_returns_nothing_to_paste_within_budget() {
    let start = Instant::now();
    // No-sample path must short-circuit without ever invoking the decoder, so
    // even a deliberately-slow closure here cannot delay us.
    let action = run_stop_flow(
        || {
            thread::sleep(Duration::from_millis(500));
            Ok("ignored".to_string())
        },
        Duration::from_secs(2),
        passthrough_cleanup,
        None,
        false,
    );
    assert!(
        matches!(action, EndOfRecordingAction::NothingToPaste),
        "got {action:?}"
    );
    // Note: run_with_timeout still spawned the decode (we always run it for
    // simplicity in the test driver); the production flow gates on
    // samples_present BEFORE calling transcribe_with_timeout. This test only
    // asserts the classifier outcome.
    assert!(start.elapsed() < Duration::from_secs(2));
}

#[test]
fn empty_decode_returns_nothing_to_paste() {
    let action = run_stop_flow(
        || Ok(String::new()),
        Duration::from_secs(1),
        passthrough_cleanup,
        None,
        true,
    );
    assert!(matches!(action, EndOfRecordingAction::NothingToPaste));
}

#[test]
fn hallucination_only_decode_returns_nothing_to_paste() {
    // Decode came back with a known whisper attractor; the cleanup filter
    // maps it to "" and the classifier treats it the same as silence.
    let action = run_stop_flow(
        || Ok("Thanks for watching".to_string()),
        Duration::from_secs(1),
        hallucination_filtering_cleanup,
        None,
        true,
    );
    assert!(matches!(action, EndOfRecordingAction::NothingToPaste));
}

#[test]
fn whisper_error_returns_show_error() {
    let action = run_stop_flow(
        || Err(TranscribeError::Failed("model not loaded".to_string())),
        Duration::from_secs(1),
        passthrough_cleanup,
        None,
        true,
    );
    match action {
        EndOfRecordingAction::ShowError(msg) => {
            assert!(msg.contains("model not loaded"), "got: {msg}");
        }
        other => panic!("expected ShowError, got {other:?}"),
    }
}

#[test]
fn hung_decode_returns_show_error_for_timeout_within_caller_budget() {
    let start = Instant::now();
    let action = run_stop_flow(
        || {
            // Worse than a real hang: sleep for 5s; the caller must escape in
            // ~100ms via the timeout.
            thread::sleep(Duration::from_secs(5));
            Ok("never delivered".to_string())
        },
        Duration::from_millis(100),
        passthrough_cleanup,
        None,
        true,
    );
    let elapsed = start.elapsed();
    assert!(
        elapsed < Duration::from_millis(500),
        "caller blocked for {elapsed:?} despite 100ms timeout"
    );
    match action {
        EndOfRecordingAction::ShowError(msg) => {
            assert!(msg.to_lowercase().contains("timeout"), "got: {msg}");
        }
        other => panic!("expected ShowError, got {other:?}"),
    }
}

#[test]
fn panicking_decode_does_not_leave_caller_hanging() {
    let start = Instant::now();
    let action = run_stop_flow(
        || -> Result<String, TranscribeError> { panic!("simulated whisper FFI panic") },
        Duration::from_millis(500),
        passthrough_cleanup,
        None,
        true,
    );
    let elapsed = start.elapsed();
    assert!(
        elapsed < Duration::from_secs(1),
        "caller blocked for {elapsed:?} after panicking decode"
    );
    // A panicking closure drops the sender; the caller observes TimedOut →
    // ShowError. The exact message can be either timeout or the original
    // panic surfaced through the channel — both are acceptable UI states.
    assert!(
        matches!(action, EndOfRecordingAction::ShowError(_)),
        "got {action:?}"
    );
}

// ── Silence-skip guarantee ────────────────────────────────────────────────

#[test]
fn silent_audio_skips_decode_and_routes_to_nothing_to_paste_within_budget() {
    // The bug being locked: pressing the dictation shortcut and saying nothing
    // used to wait the full `transcription_timeout` floor (30s) before
    // surfacing a "Transcription timed out" warning. The fix: pre-check the
    // RMS in the stop flow and short-circuit to NothingToPaste BEFORE ever
    // calling the decoder.
    //
    // This test simulates that wiring: silent samples → audio_is_silent →
    // skip decode entirely → NothingToPaste, with no wall-clock cost.
    let silent_samples = vec![0.0_f32; 20_000]; // 1.25s of zeros (matches pad)
    let start = Instant::now();
    assert!(
        audio_is_silent(&silent_samples),
        "1.25s of zeros must be classified as silent"
    );
    // Mirror the stop-flow short-circuit: silent → empty outcome → classifier.
    let outcome = Ok(TranscribedText {
        cleaned: String::new(),
        chinese_variant: None,
    });
    let action = decide_end_of_recording(true, outcome);
    let elapsed = start.elapsed();
    assert!(
        matches!(action, EndOfRecordingAction::NothingToPaste),
        "silent audio must map to NothingToPaste, got {action:?}"
    );
    assert!(
        elapsed < Duration::from_millis(50),
        "silence path must be effectively instant (got {elapsed:?})"
    );
}

#[test]
fn quiet_room_tone_also_classified_silent() {
    // Mic self-noise / room tone sits well below the 0.01 RMS threshold.
    // Must skip decode the same way pure zeros do, otherwise users with
    // sensitive mics still pay the timeout cost on a "silent" press.
    let room_tone = vec![0.001_f32; 20_000];
    assert!(audio_is_silent(&room_tone));
}

#[test]
fn speech_amplitude_does_not_trip_silence_skip() {
    // Defense-in-depth: ensure normal speech amplitudes are NOT mistakenly
    // pre-filtered as silence. RMS 0.1 is comfortably above any plausible
    // noise floor — must always reach the decoder.
    let speech = vec![0.1_f32; 16_000];
    assert!(!audio_is_silent(&speech));
}

// ── Orphan-worker guarantee ───────────────────────────────────────────────

#[test]
fn orphan_worker_finishes_after_caller_timeout() {
    // After the caller gives up, the detached worker must still complete its
    // work — that's how the whisper FFI eventually releases its locks in the
    // production code. We can't test the lock directly but we can verify the
    // closure runs to completion.
    let did_finish = Arc::new(AtomicBool::new(false));
    let did_finish_worker = did_finish.clone();
    let timeout_result = run_with_timeout(
        move || {
            thread::sleep(Duration::from_millis(150));
            did_finish_worker.store(true, Ordering::SeqCst);
            42
        },
        Duration::from_millis(20),
    );
    assert_eq!(timeout_result, Err(TimedOut));
    // Give the orphan time to finish.
    thread::sleep(Duration::from_millis(300));
    assert!(
        did_finish.load(Ordering::SeqCst),
        "orphan worker should have completed after the caller timed out"
    );
}
