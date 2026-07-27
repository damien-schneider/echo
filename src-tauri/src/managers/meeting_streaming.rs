//! Realtime streaming worker per meeting; coalesces audio between decodes. AtomicBool shutdown short-circuits backlog.

use log::{debug, error, info, warn};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Whisper FFI decode is non-cancellable — past this budget the worker thread is detached, not joined.
const WORKER_JOIN_BUDGET: Duration = Duration::from_millis(1500);

use super::streaming::{PipelineEvent, StreamingConfig, StreamingPipeline};
use super::transcription::TranscriptionManager;
use crate::commands::cleanup::{build_context_from_app_settings, CleanupState};
use crate::managers::cleanup_apply::cleanup_or_filter;
use crate::managers::model::transcription_profile_id;
use crate::settings;
use tauri::Manager as _;

/// USB-mic noise floor (~-40 dBFS); below this whisper.cpp hallucinates YouTube attractors.
pub(crate) const SILENCE_RMS_THRESHOLD: f32 = 0.01;

/// Filters whisper attractor strings (YouTube auto-captions) — LA-2 would commit them as "agreed".
pub fn is_whisper_hallucination(text: &str) -> bool {
    let normalized = normalize_for_hallucination_check(text);
    matches!(
        normalized.as_str(),
        "" | "thank you"
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
    // Punct→space so "Sous-titres"→"sous titres", "[Music]"→" music ".
    let spaced: String = lowered
        .chars()
        .map(|c| {
            if c.is_ascii_punctuation()
                || matches!(
                    c,
                    '…' | '«' | '»' | '\u{201C}' | '\u{201D}' | '\u{2018}' | '\u{2019}'
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

pub(crate) enum Cmd {
    Audio {
        source: StreamingSource,
        samples: Vec<f32>,
    },
    /// Wakes recv on empty queue (AtomicBool alone won't unblock recv).
    Shutdown,
}

pub struct StreamingWorker {
    cmd_tx: mpsc::Sender<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
}

pub struct StreamingWorkerHandle {
    cmd_tx: mpsc::Sender<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
    join: Option<thread::JoinHandle<()>>,
}

impl StreamingWorker {
    /// Loads `settings.realtime_model` before return so first decode skips load cost.
    pub fn spawn(
        app_handle: AppHandle,
        meeting_id: i64,
        transcription_manager: Arc<TranscriptionManager>,
    ) -> std::io::Result<(Arc<Self>, StreamingWorkerHandle)> {
        let model_size = settings::get_settings(&app_handle).transcription_model_size;
        let realtime_model = transcription_profile_id(model_size).to_string();
        if let Err(e) = transcription_manager.load_streaming_model(&realtime_model) {
            // Falls back to main engine via keepalive (slower).
            warn!(
                "Failed to load realtime model '{realtime_model}', falling back to main engine: {e:#}"
            );
        }

        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let cfg = StreamingConfig::default();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let tm_for_thread = transcription_manager.clone();
        let shutdown_flag_for_thread = shutdown_flag.clone();
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
        };
        Ok((worker, handle))
    }

    /// 16 kHz mono f32. No-op after shutdown.
    pub fn push_audio(&self, source: StreamingSource, samples: Vec<f32>) {
        if samples.is_empty() || self.shutdown_flag.load(Ordering::Relaxed) {
            return;
        }
        let _ = self.cmd_tx.send(Cmd::Audio { source, samples });
    }
}

impl StreamingWorkerHandle {
    /// Bounded by [`WORKER_JOIN_BUDGET`], then detaches. A detached orphan still holds the engine — never unload on that path.
    pub fn stop(mut self) {
        self.shutdown_flag.store(true, Ordering::SeqCst);
        let _ = self.cmd_tx.send(Cmd::Shutdown);
        let mut joined = true;
        if let Some(h) = self.join.take() {
            let deadline = Instant::now() + WORKER_JOIN_BUDGET;
            while !h.is_finished() && Instant::now() < deadline {
                thread::sleep(Duration::from_millis(25));
            }
            if h.is_finished() {
                if let Err(e) = h.join() {
                    warn!("streaming worker thread panicked: {e:?}");
                }
            } else {
                joined = false;
                warn!(
                    "meeting streaming worker still in FFI decode after {:?} — detaching",
                    WORKER_JOIN_BUDGET
                );
            }
        }
        debug!("streaming worker stopped (joined={joined})");
    }
}

pub(crate) fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

/// Blocks for first cmd, then try_recv coalesces backlog. Returns (mic, sys, shutdown).
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
    // Best-effort; test harness falls back to hallucination filter only.
    let cleanup_state: Option<CleanupState> = app_handle
        .try_state::<CleanupState>()
        .map(|s| s.inner().clone());
    let app_handle_for_decode = app_handle.clone();
    let mut decode_for = |samples: &[f32]| -> String {
        match transcription_manager.transcribe_for_streaming(samples.to_vec()) {
            Ok(text) => {
                decode_oks += 1;
                // Re-read so mid-meeting cleanup toggle takes effect.
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
        // Double-check brackets drain so slow-decode backlog short-circuits.
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

    // Skip final flush: batch pass produces canonical segments; flush would dup + waste decode.

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
        // -35 dBFS conversational speech.
        let s = vec![0.018f32; 1000];
        assert!(rms(&s) > SILENCE_RMS_THRESHOLD);
    }

    #[test]
    fn rms_room_tone_filtered_out() {
        // -45 dBFS USB-mic noise floor — else whisper hallucinates.
        let s = vec![0.0056f32; 1000];
        assert!(rms(&s) < SILENCE_RMS_THRESHOLD);
    }

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
        // Substrings of attractors inside real sentences must NOT match.
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
        // Square wave RMS = peak; tolerate f32 accumulation drift.
        let mut s = Vec::with_capacity(1000);
        for i in 0..1000 {
            s.push(if (i as usize).is_multiple_of(2) {
                0.2
            } else {
                -0.2
            });
        }
        assert!((rms(&s) - 0.2).abs() < 1e-3);
    }

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
        // Surface all drained audio; worker decides whether to process.
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
