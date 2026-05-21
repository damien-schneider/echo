//! Realtime streaming transcription worker for an in-progress meeting.
//!
//! Glue between the live audio capture (mic + optional system audio) and
//! [`crate::managers::streaming::StreamingPipeline`]. A single dedicated
//! thread drains an mpsc channel, coalesces all available audio chunks
//! between decodes (so a slow decode never lets the queue grow unboundedly),
//! drives one pipeline per audio source, calls into the
//! [`TranscriptionManager`] for each model decode, and emits Tauri events the
//! frontend can render as interim/final segments.
//!
//! Shutdown is signalled both via a `Cmd::Shutdown` message AND an
//! `AtomicBool` flag — the flag lets us short-circuit any already-queued
//! audio so `stop_meeting` doesn't have to wait for a multi-minute backlog
//! to drain through whisper before returning.

use log::{debug, error, info, warn};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

use super::streaming::{PipelineEvent, StreamingConfig, StreamingPipeline};
use super::transcription::TranscriptionManager;
use crate::commands::cleanup::{build_context_from_app_settings, CleanupState};
use crate::managers::cleanup_apply::cleanup_or_filter;
use crate::settings;
use tauri::Manager as _;

/// Energy threshold below which a frame is considered silence. Calibrated
/// against typical USB-mic self-noise floor (~ -40 dBFS) — anything quieter
/// is almost certainly room tone, not speech. Set too low (eg. 0.005), and
/// whisper.cpp starts hallucinating its training-distribution attractor
/// strings ("Thank you for watching", "Sous-titres Amara.org", …) on every
/// idle decode.
pub(crate) const SILENCE_RMS_THRESHOLD: f32 = 0.01;

/// Strings that whisper.cpp produces on near-silent or noise-only audio.
/// They originate from YouTube auto-captions in its training set and act as
/// powerful attractors: identical hallucinations can appear across several
/// consecutive decodes, which means LA-2 will happily commit them as
/// "agreed" speech. Filtering them at the model boundary is far simpler than
/// trying to detect them via probability heuristics that aren't surfaced by
/// the transcribe-rs API.
///
/// Match is performed on a normalized (lowercase, ascii-punctuation stripped,
/// whitespace-collapsed) version of the decoded text. Exact-match only so
/// real meeting utterances like "Thanks for joining everyone" don't get
/// nuked.
pub fn is_whisper_hallucination(text: &str) -> bool {
    let normalized = normalize_for_hallucination_check(text);
    matches!(
        normalized.as_str(),
        ""
            | "thank you"
            | "thanks"
            | "thank you very much"
            | "thanks for watching"
            | "thank you for watching"
            | "thanks for listening"
            | "thank you for listening"
            | "you"
            | "bye"
            | "okay"
            | "ok"
            | "uh"
            | "um"
            | "ah"
            | "hmm"
            | "merci"
            | "merci d avoir regardé"
            | "merci à tous"
            | "sous titres réalisés par la communauté d amara org"
            | "sous titres réalisés par"
            | "music"
            | "applause"
            | "laughter"
    )
}

fn normalize_for_hallucination_check(text: &str) -> String {
    let lowered = text.trim().to_lowercase();
    // Replace punctuation with spaces (not just delete it) so hyphenated /
    // bracketed phrases collapse to clean word boundaries — e.g. "Sous-titres"
    // → "sous titres", "[Music]" → " music ".
    let spaced: String = lowered
        .chars()
        .map(|c| {
            if c.is_ascii_punctuation()
                || matches!(
                    c,
                    '…' | '«'
                        | '»'
                        | '\u{201C}'
                        | '\u{201D}'
                        | '\u{2018}'
                        | '\u{2019}'
                )
            {
                ' '
            } else {
                c
            }
        })
        .collect();
    spaced.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StreamingSource {
    Mic,
    System,
}

#[derive(Debug, Clone, Serialize)]
struct InterimEvent {
    meeting_id: i64,
    source: StreamingSource,
    committed_text: String,
    tentative_text: String,
    segment_start_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
struct FinalEvent {
    meeting_id: i64,
    source: StreamingSource,
    text: String,
    start_ms: u64,
    end_ms: u64,
}

/// Commands accepted by the worker thread.
pub(crate) enum Cmd {
    Audio {
        source: StreamingSource,
        samples: Vec<f32>,
    },
    /// Cleanly drain pipelines and exit. Used in addition to the AtomicBool
    /// shutdown flag — the flag protects against slow-decode latency, while
    /// the message wakes a `recv()` that's blocked on an empty queue.
    Shutdown,
}

/// The shareable handle: cheap to clone (just an mpsc::Sender + a shutdown
/// flag). All forwarder threads hold a clone so they can `push_audio`. The
/// lifecycle (worker thread JoinHandle) is owned separately by
/// [`StreamingWorkerHandle`].
pub struct StreamingWorker {
    cmd_tx: mpsc::Sender<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
}

/// Owns the worker thread join handle; consumed on stop.
pub struct StreamingWorkerHandle {
    cmd_tx: mpsc::Sender<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
    join: Option<thread::JoinHandle<()>>,
    transcription_manager: Arc<TranscriptionManager>,
}

impl StreamingWorker {
    /// Spawn the worker. Loads the realtime model (per
    /// `settings.realtime_model`) into the transcription manager's streaming
    /// engine slot before returning, so the very first decode doesn't pay
    /// the model-load cost. Returns an `Arc<StreamingWorker>` for forwarders
    /// to share + a `StreamingWorkerHandle` to be retained by the caller for
    /// later orderly shutdown.
    pub fn spawn(
        app_handle: AppHandle,
        meeting_id: i64,
        transcription_manager: Arc<TranscriptionManager>,
    ) -> std::io::Result<(Arc<Self>, StreamingWorkerHandle)> {
        let realtime_model = settings::get_settings(&app_handle).realtime_model;
        if realtime_model.is_empty() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "no realtime_model configured",
            ));
        }
        if let Err(e) = transcription_manager.load_streaming_model(&realtime_model) {
            // Fall back to the main engine via keepalive — the worker will
            // still function, just slower with whatever the user's main
            // model is.
            warn!(
                "Failed to load realtime model '{realtime_model}', falling back to main engine: {e:#}"
            );
        }

        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let cfg = StreamingConfig::default();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let tm_for_thread = transcription_manager.clone();
        let shutdown_flag_for_thread = shutdown_flag.clone();
        // Pin the main model loaded across decodes (suppress Immediately
        // unload) — keeps the fallback path snappy if the streaming engine
        // failed to load.
        transcription_manager.acquire_keepalive();
        let join = thread::Builder::new()
            .name(format!("meeting-streaming-{meeting_id}"))
            .spawn(move || {
                run_worker(
                    app_handle,
                    meeting_id,
                    tm_for_thread,
                    cmd_rx,
                    shutdown_flag_for_thread,
                    cfg,
                );
            })?;
        info!(
            "Streaming worker started for meeting {meeting_id} (window {}s, step {}s, silence-flush {}ms, model {realtime_model})",
            cfg.max_window_samples / 16_000,
            cfg.step_samples / 16_000,
            cfg.silence_flush_samples * 1000 / 16_000
        );
        let worker = Arc::new(Self {
            cmd_tx: cmd_tx.clone(),
            shutdown_flag: shutdown_flag.clone(),
        });
        let handle = StreamingWorkerHandle {
            cmd_tx,
            shutdown_flag,
            join: Some(join),
            transcription_manager,
        };
        Ok((worker, handle))
    }

    /// Forward an audio chunk (16 kHz mono f32) to the worker. Drops on send
    /// failure (worker has exited) and is a no-op after shutdown.
    pub fn push_audio(&self, source: StreamingSource, samples: Vec<f32>) {
        if samples.is_empty() || self.shutdown_flag.load(Ordering::Relaxed) {
            return;
        }
        if self.cmd_tx.send(Cmd::Audio { source, samples }).is_err() {
            // Worker has shut down — nothing to do.
        }
    }
}

impl StreamingWorkerHandle {
    /// Signal the worker to exit, then join its thread. Idempotent. Does
    /// NOT wait for queued audio to be decoded — the flag short-circuits the
    /// worker's main loop so this returns within one in-flight decode at
    /// worst.
    pub fn stop(mut self) {
        self.shutdown_flag.store(true, Ordering::SeqCst);
        // Send Shutdown to wake the worker if it's blocked on an empty
        // queue. send() may fail if the worker already exited — that's fine.
        let _ = self.cmd_tx.send(Cmd::Shutdown);
        if let Some(h) = self.join.take() {
            if let Err(e) = h.join() {
                warn!("streaming worker thread panicked: {e:?}");
            }
        }
        self.transcription_manager.release_keepalive();
        self.transcription_manager.unload_streaming_model();
        debug!("streaming worker stopped + joined");
    }
}

pub(crate) fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

/// Drain all currently-available commands into per-source audio buffers + a
/// shutdown flag. Blocks (`recv`) for the first command if the queue is
/// empty; afterwards uses `try_recv` to coalesce anything the worker fell
/// behind on while it was decoding.
///
/// Returns `(mic_buf, sys_buf, shutdown)` where:
///  - `mic_buf` / `sys_buf` are all audio chunks for that source, concatenated
///  - `shutdown` is true if a `Cmd::Shutdown` was seen OR the channel closed
///
/// Pure modulo the `mpsc::Receiver`, so easy to unit-test with a fake channel.
pub(crate) fn drain_commands(cmd_rx: &mpsc::Receiver<Cmd>) -> (Vec<f32>, Vec<f32>, bool) {
    let mut mic = Vec::new();
    let mut sys = Vec::new();
    let mut shutdown = false;

    let first = match cmd_rx.recv() {
        Ok(c) => c,
        Err(_) => return (mic, sys, true),
    };
    classify_cmd(first, &mut mic, &mut sys, &mut shutdown);

    loop {
        match cmd_rx.try_recv() {
            Ok(c) => classify_cmd(c, &mut mic, &mut sys, &mut shutdown),
            Err(mpsc::TryRecvError::Empty) => break,
            Err(mpsc::TryRecvError::Disconnected) => {
                shutdown = true;
                break;
            }
        }
    }
    (mic, sys, shutdown)
}

fn classify_cmd(cmd: Cmd, mic: &mut Vec<f32>, sys: &mut Vec<f32>, shutdown: &mut bool) {
    match cmd {
        Cmd::Audio {
            source: StreamingSource::Mic,
            mut samples,
        } => mic.append(&mut samples),
        Cmd::Audio {
            source: StreamingSource::System,
            mut samples,
        } => sys.append(&mut samples),
        Cmd::Shutdown => *shutdown = true,
    }
}

fn run_worker(
    app_handle: AppHandle,
    meeting_id: i64,
    transcription_manager: Arc<TranscriptionManager>,
    cmd_rx: mpsc::Receiver<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
    cfg: StreamingConfig,
) {
    debug!("streaming worker for meeting {meeting_id} entering main loop");
    transcription_manager.initiate_model_load();

    let mut mic_pipeline = StreamingPipeline::new(cfg);
    let mut sys_pipeline = StreamingPipeline::new(cfg);

    let mut mic_chunks = 0usize;
    let mut sys_chunks = 0usize;
    let mut decode_errs = 0usize;
    let mut decode_oks = 0usize;
    // Cleanup state lookup is best-effort: if it's not registered (e.g. in a
    // unit-test harness that doesn't construct the full Tauri app), we
    // fall back to None and the helper short-circuits to the
    // hallucination filter.
    let cleanup_state: Option<CleanupState> = app_handle
        .try_state::<CleanupState>()
        .map(|s| s.inner().clone());
    let app_handle_for_decode = app_handle.clone();
    let mut decode_for = |samples: &[f32]| -> String {
        match transcription_manager.transcribe_for_streaming(samples.to_vec()) {
            Ok(text) => {
                decode_oks += 1;
                // Re-read settings each decode so toggling cleanup mid-meeting
                // takes effect immediately (the read is cheap and serialised
                // through SETTINGS_LOCK).
                let settings_snapshot = settings::get_settings(&app_handle_for_decode);
                let cleaned = if let Some(state) = cleanup_state.as_ref() {
                    cleanup_or_filter(&text, state, &settings_snapshot, || {
                        build_context_from_app_settings(&settings_snapshot)
                    })
                } else if is_whisper_hallucination(&text) {
                    String::new()
                } else {
                    text.clone()
                };
                if cleaned.is_empty() && !text.is_empty() {
                    debug!("dropped whisper hallucination or cleanup-empty: {text:?}");
                }
                cleaned
            }
            Err(e) => {
                decode_errs += 1;
                if decode_errs <= 3 || decode_errs.is_multiple_of(50) {
                    warn!("streaming decode failed (#{decode_errs}): {e:#}");
                }
                String::new()
            }
        }
    };

    loop {
        // Re-check the shutdown flag both before AND after draining commands
        // — the flag is the only thing that can short-circuit a backlog
        // accumulated during a slow decode.
        if shutdown_flag.load(Ordering::Relaxed) {
            break;
        }
        let (mic_buf, sys_buf, sd) = drain_commands(&cmd_rx);
        if sd || shutdown_flag.load(Ordering::Relaxed) {
            break;
        }

        if !mic_buf.is_empty() {
            mic_chunks += 1;
            let is_speech = rms(&mic_buf) > SILENCE_RMS_THRESHOLD;
            let events = mic_pipeline.push(&mic_buf, is_speech, &mut decode_for);
            emit_events(&app_handle, meeting_id, StreamingSource::Mic, events);
        }
        if !sys_buf.is_empty() {
            sys_chunks += 1;
            let is_speech = rms(&sys_buf) > SILENCE_RMS_THRESHOLD;
            let events = sys_pipeline.push(&sys_buf, is_speech, &mut decode_for);
            emit_events(&app_handle, meeting_id, StreamingSource::System, events);
        }
    }

    // Intentionally skip the final flush: on stop the batch transcription
    // pass kicks in and produces canonical segments. Flushing here would
    // burn one more multi-second decode AND emit duplicate text the frontend
    // would have to dedupe against the batch output.

    info!(
        "streaming worker meeting={meeting_id} exiting (mic_chunks={mic_chunks} sys_chunks={sys_chunks} decode_ok={decode_oks} decode_err={decode_errs})"
    );
}

fn emit_events(
    app_handle: &AppHandle,
    meeting_id: i64,
    source: StreamingSource,
    events: Vec<PipelineEvent>,
) {
    for ev in events {
        match ev {
            PipelineEvent::Interim {
                committed_text,
                tentative_text,
                segment_start_ms,
            } => {
                if let Err(e) = app_handle.emit(
                    "meeting-streaming-interim",
                    InterimEvent {
                        meeting_id,
                        source,
                        committed_text,
                        tentative_text,
                        segment_start_ms,
                    },
                ) {
                    error!("emit meeting-streaming-interim failed: {e:#}");
                }
            }
            PipelineEvent::Final {
                text,
                start_ms,
                end_ms,
            } => {
                if let Err(e) = app_handle.emit(
                    "meeting-streaming-final",
                    FinalEvent {
                        meeting_id,
                        source,
                        text,
                        start_ms,
                        end_ms,
                    },
                ) {
                    error!("emit meeting-streaming-final failed: {e:#}");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_zero_for_empty() {
        assert_eq!(rms(&[]), 0.0);
    }

    #[test]
    fn rms_matches_constant() {
        let s = vec![0.1f32; 1000];
        assert!((rms(&s) - 0.1).abs() < 1e-6);
    }

    #[test]
    fn rms_silence_below_threshold() {
        let s = vec![0.0f32; 1000];
        assert!(rms(&s) < SILENCE_RMS_THRESHOLD);
    }

    #[test]
    fn rms_speech_above_threshold() {
        let s = vec![0.05f32; 1000];
        assert!(rms(&s) > SILENCE_RMS_THRESHOLD);
    }

    #[test]
    fn rms_quiet_speech_just_above_threshold() {
        // Conversational speech at -35 dBFS = ~0.018 amplitude. Should clear
        // the threshold comfortably without dragging room tone (~ -45 dBFS)
        // along with it.
        let s = vec![0.018f32; 1000];
        assert!(rms(&s) > SILENCE_RMS_THRESHOLD);
    }

    #[test]
    fn rms_room_tone_filtered_out() {
        // Typical USB-mic self-noise / quiet room: -45 dBFS ≈ 0.0056.
        // Must NOT be classified as speech — otherwise whisper hallucinates.
        let s = vec![0.0056f32; 1000];
        assert!(rms(&s) < SILENCE_RMS_THRESHOLD);
    }

    // ── is_whisper_hallucination ───────────────────────────────────────────

    #[test]
    fn hallucination_matches_thank_you_variants() {
        assert!(is_whisper_hallucination("Thank you."));
        assert!(is_whisper_hallucination(" thank you "));
        assert!(is_whisper_hallucination("THANK YOU"));
        assert!(is_whisper_hallucination("Thanks for watching!"));
        assert!(is_whisper_hallucination("Thank you for watching."));
    }

    #[test]
    fn hallucination_matches_amara_subtitle_credit() {
        assert!(is_whisper_hallucination(
            "Sous-titres réalisés par la communauté d'Amara.org"
        ));
        assert!(is_whisper_hallucination("Sous-titres réalisés par"));
    }

    #[test]
    fn hallucination_matches_lone_filler_words() {
        assert!(is_whisper_hallucination("you"));
        assert!(is_whisper_hallucination(" you. "));
        assert!(is_whisper_hallucination("um"));
        assert!(is_whisper_hallucination("uh"));
        assert!(is_whisper_hallucination("..."));
        assert!(is_whisper_hallucination(""));
    }

    #[test]
    fn hallucination_does_not_match_real_speech() {
        // Substrings of attractor phrases inside real sentences must NOT
        // be dropped.
        assert!(!is_whisper_hallucination(
            "Thanks for joining the call everyone, let's get started"
        ));
        assert!(!is_whisper_hallucination("You said the deadline is Friday"));
        assert!(!is_whisper_hallucination(
            "I think we should review the design"
        ));
        assert!(!is_whisper_hallucination("Merci de partager le document"));
    }

    #[test]
    fn hallucination_check_strips_brackets_and_punctuation() {
        assert!(is_whisper_hallucination("[Music]"));
        assert!(is_whisper_hallucination("[ Applause ]"));
        assert!(is_whisper_hallucination("(laughter)"));
    }

    #[test]
    fn rms_alternating_signal() {
        // Square wave: rms = peak amplitude. Tolerate f32 accumulation error
        // across 1000 adds.
        let mut s = Vec::with_capacity(1000);
        for i in 0..1000 {
            s.push(if (i as usize).is_multiple_of(2) { 0.2 } else { -0.2 });
        }
        assert!((rms(&s) - 0.2).abs() < 1e-3);
    }

    // ── drain_commands ─────────────────────────────────────────────────────

    #[test]
    fn drain_commands_returns_shutdown_when_disconnected() {
        let (tx, rx) = mpsc::channel::<Cmd>();
        drop(tx);
        let (mic, sys, sd) = drain_commands(&rx);
        assert!(mic.is_empty());
        assert!(sys.is_empty());
        assert!(sd);
    }

    #[test]
    fn drain_commands_coalesces_multiple_audio_chunks_per_source() {
        let (tx, rx) = mpsc::channel::<Cmd>();
        tx.send(Cmd::Audio {
            source: StreamingSource::Mic,
            samples: vec![0.1; 4],
        })
        .unwrap();
        tx.send(Cmd::Audio {
            source: StreamingSource::Mic,
            samples: vec![0.2; 3],
        })
        .unwrap();
        tx.send(Cmd::Audio {
            source: StreamingSource::System,
            samples: vec![0.3; 2],
        })
        .unwrap();
        let (mic, sys, sd) = drain_commands(&rx);
        assert_eq!(mic.len(), 7);
        assert_eq!(sys.len(), 2);
        assert!(!sd);
    }

    #[test]
    fn drain_commands_surfaces_shutdown_mid_backlog() {
        let (tx, rx) = mpsc::channel::<Cmd>();
        tx.send(Cmd::Audio {
            source: StreamingSource::Mic,
            samples: vec![0.1; 4],
        })
        .unwrap();
        tx.send(Cmd::Shutdown).unwrap();
        tx.send(Cmd::Audio {
            source: StreamingSource::Mic,
            samples: vec![0.2; 4],
        })
        .unwrap();
        let (mic, _sys, sd) = drain_commands(&rx);
        assert!(sd, "shutdown should be reported even mid-backlog");
        // We still surface ALL drained audio — the worker decides whether to
        // process it. (Currently it skips because shutdown is set.)
        assert_eq!(mic.len(), 8);
    }

    #[test]
    fn drain_commands_returns_after_first_when_queue_drains() {
        let (tx, rx) = mpsc::channel::<Cmd>();
        tx.send(Cmd::Audio {
            source: StreamingSource::Mic,
            samples: vec![0.5; 10],
        })
        .unwrap();
        let (mic, sys, sd) = drain_commands(&rx);
        assert_eq!(mic.len(), 10);
        assert!(sys.is_empty());
        assert!(!sd);
    }
}
