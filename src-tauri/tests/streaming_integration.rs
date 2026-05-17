//! End-to-end integration coverage for the realtime streaming pipeline.
//!
//! These tests don't load the Whisper model; instead they drive
//! [`StreamingPipeline`] with a stubbed decode function so the test always
//! runs in CI. The unit tests in `src/managers/streaming.rs` cover the LA-2
//! committer in isolation; this file proves the pipeline survives realistic
//! frame rates, threading, and audio shapes.

use echo_app_lib::managers::streaming::{
    LocalAgreementCommitter, PipelineEvent, StreamingConfig, StreamingPipeline,
};
use std::f32::consts::TAU;
use std::sync::{Arc, Mutex};

const SAMPLE_RATE: usize = 16_000;
const FRAME_SAMPLES: usize = 480; // 30 ms — matches the resampler frame size

/// 1 second of mono sine audio at the given frequency, amplitude 0.3.
fn sine_seconds(freq_hz: f32, secs: f32) -> Vec<f32> {
    let n = (SAMPLE_RATE as f32 * secs) as usize;
    (0..n)
        .map(|i| 0.3 * (TAU * freq_hz * i as f32 / SAMPLE_RATE as f32).sin())
        .collect()
}

#[test]
fn realistic_frame_rate_emits_interim_then_final() {
    // Use a config large enough that the silence flush — not the hard cap —
    // is what produces the Final in this test. (The crate default's 5s
    // max_window is tuned for live UX, not for this fixture's 10s buffer.)
    let mut pipeline = StreamingPipeline::new(StreamingConfig {
        min_window_samples: SAMPLE_RATE,
        step_samples: SAMPLE_RATE / 2,
        max_window_samples: 15 * SAMPLE_RATE,
        silence_flush_samples: (0.4 * SAMPLE_RATE as f32) as usize,
    });

    // Decode stub: returns a transcript whose word count grows with the
    // buffer size. This exercises both the LA-2 commit path (consecutive
    // calls have agreeing prefixes) and the silence-flush Final path.
    let decoded = Arc::new(Mutex::new(Vec::<usize>::new()));
    let decoded_for_closure = decoded.clone();
    let mut decode = move |buf: &[f32]| -> String {
        decoded_for_closure.lock().unwrap().push(buf.len());
        let words = std::cmp::min(20, buf.len() / SAMPLE_RATE);
        ["one", "two", "three", "four", "five", "six", "seven", "eight"]
            .iter()
            .cycle()
            .take(words)
            .copied()
            .collect::<Vec<_>>()
            .join(" ")
    };

    // Push 10 s of sine in 30 ms frames.
    let audio = sine_seconds(220.0, 10.0);
    let mut all_events = Vec::new();
    for frame in audio.chunks(FRAME_SAMPLES) {
        let evs = pipeline.push(frame, true, &mut decode);
        all_events.extend(evs);
    }

    // Then push 0.7 s of silence to trigger a Final.
    let silence = vec![0.0f32; (0.7 * SAMPLE_RATE as f32) as usize];
    for frame in silence.chunks(FRAME_SAMPLES) {
        let evs = pipeline.push(frame, false, &mut decode);
        all_events.extend(evs);
    }

    let interim_count = all_events
        .iter()
        .filter(|e| matches!(e, PipelineEvent::Interim { .. }))
        .count();
    let final_count = all_events
        .iter()
        .filter(|e| matches!(e, PipelineEvent::Final { .. }))
        .count();

    assert!(
        interim_count >= 5,
        "expected several interim events for 10s of audio with 1s step, got {interim_count}"
    );
    assert_eq!(
        final_count, 1,
        "expected exactly one Final from the silence flush, got {final_count}"
    );
    let calls = decoded.lock().unwrap().len();
    assert!(
        calls >= 6,
        "decode should be called repeatedly across 10s of audio, got {calls}"
    );
}

#[test]
fn long_meeting_simulation_does_not_leak_or_starve() {
    // A 5 minute simulated meeting at 30 ms frames = 10_000 push() calls.
    // Goal: catch state explosions, runaway buffers, accidental panics.
    let mut pipeline = StreamingPipeline::new(StreamingConfig {
        min_window_samples: 2 * SAMPLE_RATE,
        step_samples: SAMPLE_RATE,
        max_window_samples: 15 * SAMPLE_RATE,
        silence_flush_samples: SAMPLE_RATE / 2,
    });

    let mut decode_calls = 0usize;
    let mut decode = |_buf: &[f32]| {
        decode_calls += 1;
        "the quick brown fox".to_string()
    };

    let secs = 300.0;
    let audio = sine_seconds(180.0, secs);
    // Inject a 0.6s silence every 8s to simulate natural pauses.
    let silence_block = vec![0.0f32; (0.6 * SAMPLE_RATE as f32) as usize];

    let mut elapsed_samples = 0usize;
    let mut events = Vec::new();
    for frame in audio.chunks(FRAME_SAMPLES) {
        events.extend(pipeline.push(frame, true, &mut decode));
        elapsed_samples += frame.len();
        if elapsed_samples >= 8 * SAMPLE_RATE {
            for sframe in silence_block.chunks(FRAME_SAMPLES) {
                events.extend(pipeline.push(sframe, false, &mut decode));
            }
            elapsed_samples = 0;
        }
    }
    events.extend(pipeline.flush(&mut decode));

    let finals = events
        .iter()
        .filter(|e| matches!(e, PipelineEvent::Final { .. }))
        .count();
    // 300 s with ~8s-spaced silences should produce 30+ Finals.
    assert!(
        finals >= 20,
        "expected many Finals over 5min meeting, got {finals}"
    );
    // Sanity: pipeline never stalled — decode was called many times.
    assert!(decode_calls > 100);
}

#[test]
fn committer_pipeline_round_trip_progressive_decode() {
    // Reproduce the exact use-case promised to the user: text starts as
    // tentative, then gets promoted to committed as more decodes confirm it.
    let mut committer = LocalAgreementCommitter::new();
    let outputs = ["the", "the quick", "the quick brown", "the quick brown fox"];

    let final_delta = outputs.iter().fold(None, |_acc, out| {
        let words: Vec<String> = out.split_whitespace().map(String::from).collect();
        Some(committer.observe(words))
    });

    let final_delta = final_delta.expect("at least one observe");
    // After 4 progressive decodes, "the quick brown" is committed and "fox"
    // is the lone tentative tail.
    assert_eq!(final_delta.committed_text, "the quick brown");
    assert_eq!(final_delta.tentative_text, "fox");
}

// ── Edge cases the user asked for: things that would silently break realtime
// transcription in production. Each test simulates a specific hazard.

/// Whisper.cpp is famous for hallucinating on silence — common attractor
/// strings include "Thank you for watching!" and "Sous-titres réalisés par
/// la communauté d'Amara.org". When the model produces these intermittently
/// across decodes of a *quiet* buffer, LA-2 must NOT commit them as if they
/// were stable speech: the second decode rarely produces the same hallucination.
#[test]
fn la2_does_not_commit_whisper_hallucinations() {
    let mut pipeline = StreamingPipeline::new(StreamingConfig::default());
    let outputs = std::cell::RefCell::new(vec![
        "Thank you for watching!".to_string(),
        "Sous-titres réalisés par la communauté d'Amara.org".to_string(),
        "you".to_string(),
        "".to_string(),
    ]);
    let mut decode = |_: &[f32]| -> String {
        let mut o = outputs.borrow_mut();
        if o.is_empty() {
            String::new()
        } else {
            o.remove(0)
        }
    };
    // Push enough audio to trigger 4 decodes back-to-back.
    let audio = sine_seconds(220.0, 12.0);
    let mut all_events = Vec::new();
    for frame in audio.chunks(FRAME_SAMPLES) {
        all_events.extend(pipeline.push(frame, true, &mut decode));
    }
    let last_committed = all_events
        .iter()
        .filter_map(|e| match e {
            PipelineEvent::Interim { committed_text, .. } => Some(committed_text.clone()),
            _ => None,
        })
        .last()
        .unwrap_or_default();
    assert!(
        !last_committed.contains("Amara") && !last_committed.contains("Thank"),
        "hallucination text leaked into committed: {last_committed:?}"
    );
}

/// Whisper sometimes oscillates between two near-identical transcripts as
/// the buffer grows. The committer's LCP-of-consecutive-decodes design means
/// stable head words still commit even when the tail flip-flops.
#[test]
fn la2_handles_oscillating_tail() {
    let mut committer = LocalAgreementCommitter::new();
    committer.observe(["the", "meeting", "starts", "now"].map(String::from).to_vec());
    let d2 = committer.observe(["the", "meeting", "starts", "today"].map(String::from).to_vec());
    let d3 = committer.observe(["the", "meeting", "starts", "now"].map(String::from).to_vec());
    // Each LCP comparison sees a stable 3-word prefix.
    assert_eq!(d2.committed_text, "the meeting starts");
    assert_eq!(d3.committed_text, "the meeting starts");
    // The tail bounces between "now" / "today" but never gets committed.
    assert_ne!(d2.tentative_text, d3.tentative_text);
}

/// Catastrophic case: whisper revises an EARLY word after several decodes
/// agreed. The committer must regress the committed prefix rather than emit a
/// stale fragment.
#[test]
fn la2_regresses_committed_prefix_on_early_revision() {
    let mut committer = LocalAgreementCommitter::new();
    committer.observe(["he", "said", "yes"].map(String::from).to_vec());
    let d2 = committer.observe(["he", "said", "yes", "today"].map(String::from).to_vec());
    assert_eq!(d2.committed_text, "he said yes");
    // Now decoder reconsiders and changes "he" to "she".
    let d3 = committer.observe(["she", "said", "yes", "today"].map(String::from).to_vec());
    assert_eq!(d3.committed_text, "");
    assert_eq!(d3.tentative_text, "she said yes today");
}

/// Several empty-string decodes in a row (whisper bailed on a buffer it
/// considered too short / too noisy). When real text finally appears, the
/// committer must not falsely commit it from "matching" the previous empties.
#[test]
fn empty_decodes_do_not_falsely_commit() {
    let mut committer = LocalAgreementCommitter::new();
    let _ = committer.observe(vec![]);
    let _ = committer.observe(vec![]);
    let d3 = committer.observe(vec!["hello".into(), "world".into()]);
    // Previous decode was empty, so LCP is 0 — nothing committed.
    assert_eq!(d3.committed_text, "");
    assert_eq!(d3.tentative_text, "hello world");
}

/// VAD-driven silence flush should fire AT MOST ONCE per silent stretch even
/// if more silent frames keep arriving. Otherwise we'd emit duplicate Finals.
#[test]
fn long_silence_flushes_exactly_once() {
    let mut pipeline = StreamingPipeline::new(StreamingConfig {
        min_window_samples: SAMPLE_RATE,
        step_samples: SAMPLE_RATE / 2,
        max_window_samples: 20 * SAMPLE_RATE,
        silence_flush_samples: SAMPLE_RATE / 2,
    });
    let mut decode = |_: &[f32]| "speech words".to_string();

    // 2s speech to fill the buffer past min_window, then 5s silence.
    let speech_audio = sine_seconds(220.0, 2.0);
    for frame in speech_audio.chunks(FRAME_SAMPLES) {
        pipeline.push(frame, true, &mut decode);
    }
    let mut events = Vec::new();
    let silence = vec![0.0f32; 5 * SAMPLE_RATE];
    for frame in silence.chunks(FRAME_SAMPLES) {
        events.extend(pipeline.push(frame, false, &mut decode));
    }
    let final_count = events
        .iter()
        .filter(|e| matches!(e, PipelineEvent::Final { .. }))
        .count();
    assert_eq!(
        final_count, 1,
        "silence should flush a single Final, got {final_count}"
    );
}

/// Pure silence from the very start: no min_window crossed → no decode, no
/// Final. The pipeline should stay totally idle (no model calls, no events).
#[test]
fn pure_silence_from_start_emits_nothing() {
    let mut pipeline = StreamingPipeline::new(StreamingConfig::default());
    let mut decode_calls = 0;
    let mut decode = |_: &[f32]| {
        decode_calls += 1;
        "should not be called".to_string()
    };
    let silence = vec![0.0f32; 10 * SAMPLE_RATE];
    let mut events = Vec::new();
    for frame in silence.chunks(FRAME_SAMPLES) {
        events.extend(pipeline.push(frame, false, &mut decode));
    }
    assert_eq!(events.len(), 0);
    // We do allow a single decode at the silence-flush point if min_window
    // was crossed before the silence_run check, but with pure silence from
    // the very first frame, the silence_run grows alongside the buffer and
    // both gate-conditions trip at the same time (silence_flush wins).
    assert!(
        decode_calls <= 1,
        "pure silence triggered too many decodes: {decode_calls}"
    );
}

/// Hard cap fires mid-speech without a silence boundary — the next segment
/// must start at the correct ms offset, not at 0.
#[test]
fn hard_cap_preserves_segment_continuity() {
    let mut pipeline = StreamingPipeline::new(StreamingConfig {
        min_window_samples: SAMPLE_RATE,
        step_samples: SAMPLE_RATE,
        max_window_samples: 3 * SAMPLE_RATE,
        silence_flush_samples: SAMPLE_RATE / 2,
    });
    let mut decode = |_: &[f32]| "stuff".to_string();
    // 7s of unbroken speech — should cap-finalize at 3s and again around 6s.
    let speech_audio = sine_seconds(220.0, 7.0);
    let mut events = Vec::new();
    for frame in speech_audio.chunks(FRAME_SAMPLES) {
        events.extend(pipeline.push(frame, true, &mut decode));
    }
    let finals: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            PipelineEvent::Final { start_ms, end_ms, .. } => Some((*start_ms, *end_ms)),
            _ => None,
        })
        .collect();
    assert!(
        finals.len() >= 2,
        "expected at least 2 hard-cap finals over 7s, got {}",
        finals.len()
    );
    // Segment 2 must start at or after segment 1's end.
    assert!(finals[1].0 >= finals[0].1.saturating_sub(50));
    // No segment starts at 0 except the first one.
    for (i, f) in finals.iter().enumerate().skip(1) {
        assert!(f.0 > 0, "segment {i} starts at 0ms unexpectedly");
    }
}

/// A 1-sample frame is degenerate but should not panic, leak, or alter state.
#[test]
fn single_sample_frame_is_safe() {
    let mut pipeline = StreamingPipeline::new(StreamingConfig::default());
    let mut decode = |_: &[f32]| "x".to_string();
    let events = pipeline.push(&[0.1], true, &mut decode);
    assert!(events.is_empty());
}

/// Frame larger than max_window should produce a single Final on push, not
/// loop forever or split incorrectly.
#[test]
fn oversized_frame_force_finalizes_once() {
    let cfg = StreamingConfig {
        min_window_samples: SAMPLE_RATE,
        step_samples: SAMPLE_RATE,
        max_window_samples: 2 * SAMPLE_RATE,
        silence_flush_samples: SAMPLE_RATE / 2,
    };
    let mut pipeline = StreamingPipeline::new(cfg);
    let mut decode_count = 0;
    let mut decode = |_: &[f32]| {
        decode_count += 1;
        "long buffer".to_string()
    };
    // One frame of 5s, way beyond max_window.
    let frame = sine_seconds(220.0, 5.0);
    let events = pipeline.push(&frame, true, &mut decode);
    let finals = events
        .iter()
        .filter(|e| matches!(e, PipelineEvent::Final { .. }))
        .count();
    assert_eq!(finals, 1);
    assert_eq!(decode_count, 1);
}

/// Two independent pipelines (mic + system) running in parallel must not
/// share state — committed text from one source must not leak into the other.
#[test]
fn parallel_pipelines_are_isolated() {
    let mut mic = StreamingPipeline::new(StreamingConfig::default());
    let mut sys = StreamingPipeline::new(StreamingConfig::default());

    let mut decode_mic = |_: &[f32]| "alice spoke".to_string();
    let mut decode_sys = |_: &[f32]| "bob replied".to_string();

    let speech_audio = sine_seconds(220.0, 5.0);
    let mut mic_events = Vec::new();
    let mut sys_events = Vec::new();
    for frame in speech_audio.chunks(FRAME_SAMPLES) {
        mic_events.extend(mic.push(frame, true, &mut decode_mic));
        sys_events.extend(sys.push(frame, true, &mut decode_sys));
    }

    let mic_committed = mic_events
        .iter()
        .filter_map(|e| match e {
            PipelineEvent::Interim { committed_text, .. } => Some(committed_text.clone()),
            _ => None,
        })
        .last()
        .unwrap_or_default();
    let sys_committed = sys_events
        .iter()
        .filter_map(|e| match e {
            PipelineEvent::Interim { committed_text, .. } => Some(committed_text.clone()),
            _ => None,
        })
        .last()
        .unwrap_or_default();
    if !mic_committed.is_empty() {
        assert!(!mic_committed.contains("bob"));
    }
    if !sys_committed.is_empty() {
        assert!(!sys_committed.contains("alice"));
    }
}

/// Long single-utterance decode (1000 words) shouldn't panic the committer.
#[test]
fn committer_handles_unrealistically_long_decode() {
    let mut committer = LocalAgreementCommitter::new();
    let words: Vec<String> = (0..1000).map(|i| format!("word{i}")).collect();
    let d1 = committer.observe(words.clone());
    assert_eq!(d1.committed_text, ""); // first decode commits nothing
    let d2 = committer.observe(words.clone());
    assert_eq!(d2.committed_text.split_whitespace().count(), 1000);
}

/// Stop / start cycle without any audio — flush returns [], pipeline state
/// resets cleanly via reconstruction.
#[test]
fn rapid_stop_start_no_audio_is_safe() {
    let mut pipeline = StreamingPipeline::new(StreamingConfig::default());
    let mut decode = |_: &[f32]| "x".to_string();
    assert!(pipeline.flush(&mut decode).is_empty());
    // Re-use after flush.
    let _ = pipeline.push(&sine_seconds(220.0, 2.0), true, &mut decode);
    let evs = pipeline.flush(&mut decode);
    assert!(!evs.is_empty());
}
