//! Realtime streaming worker per meeting; coalesces audio between decodes. AtomicBool shutdown short-circuits backlog.

use log::{debug, error, info, warn};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::audio::load_speech_vad;
use crate::audio_toolkit::constants::SAMPLE_RATE;
use crate::audio_toolkit::vad::SpeechFrames;

use super::streaming::{trim_backlog, PipelineEvent, StreamingConfig, StreamingPipeline};
use super::transcription::{StreamingTranscriber, TranscriptionManager};
use crate::managers::cleanup_apply::clean_transcript;
use crate::managers::hallucination::HallucinationFilter;
use crate::managers::model::transcription_profile_id;
use crate::settings;

/// A live decode in flight runs to its end — past this budget the worker thread is detached, not joined.
const WORKER_JOIN_BUDGET: Duration = Duration::from_millis(1500);

/// USB-mic noise floor (~-40 dBFS); below this Whisper hallucinates YouTube attractors.
pub(crate) const SILENCE_RMS_THRESHOLD: f32 = 0.01;

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
    pub fn spawn(
        app_handle: AppHandle,
        meeting_id: i64,
        transcription_manager: Arc<TranscriptionManager>,
    ) -> std::io::Result<(Arc<Self>, StreamingWorkerHandle)> {
        let cfg = StreamingConfig::default();
        let preview_for = || -> std::io::Result<SourcePreview> {
            let vad = load_speech_vad(&app_handle)
                .map_err(|e| std::io::Error::other(format!("{e:#}")))?;
            Ok(SourcePreview::new(SpeechFrames::new(Box::new(vad)), cfg))
        };
        let previews = SourcePreviews {
            mic: preview_for()?,
            system: preview_for()?,
        };
        let settings_snapshot = settings::get_settings(&app_handle);
        let realtime_model =
            transcription_profile_id(settings_snapshot.transcription_model_size).to_string();
        transcription_manager
            .load_streaming_model(&realtime_model)
            .map_err(|e| std::io::Error::other(format!("{e:#}")))?;
        let transcriber_for = |manager: Arc<TranscriptionManager>| {
            StreamingTranscriber::new(manager, &settings_snapshot.selected_language)
                .map_err(std::io::Error::other)
        };
        let transcribers = SourceTranscribers {
            mic: transcriber_for(transcription_manager.clone())?,
            system: transcriber_for(transcription_manager)?,
        };

        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let shutdown_flag_for_thread = shutdown_flag.clone();
        let join = thread::Builder::new()
            .name(format!("meeting-streaming-{meeting_id}"))
            .spawn(move || {
                run_worker(
                    app_handle,
                    meeting_id,
                    transcribers,
                    previews,
                    cmd_rx,
                    shutdown_flag_for_thread,
                );
            })?;
        info!(
            "Streaming worker started for meeting {meeting_id} (window {}ms, step {}ms, silence-flush {}ms, model {realtime_model})",
            cfg.max_window_samples * 1000 / SAMPLE_RATE,
            cfg.step_samples * 1000 / SAMPLE_RATE,
            cfg.silence_flush_samples * 1000 / SAMPLE_RATE
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

    // Trimming per command, not once at the end: an hour of backlog would otherwise be
    // materialized in full before anything was dropped from it.
    let mut dropped = trim_backlog(&mut mic) + trim_backlog(&mut sys);
    loop {
        match cmd_rx.try_recv() {
            Ok(c) => {
                classify_cmd(c, &mut mic, &mut sys, &mut shutdown);
                dropped += trim_backlog(&mut mic) + trim_backlog(&mut sys);
            }
            Err(mpsc::TryRecvError::Empty) => break,
            Err(mpsc::TryRecvError::Disconnected) => {
                shutdown = true;
                break;
            }
        }
    }
    if dropped > 0 {
        warn!(
            "meeting streaming fell behind — dropped {:.1}s of preview audio to catch up",
            dropped as f32 / SAMPLE_RATE as f32
        );
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

/// Each source pins its own language: mic noise must not decide what the guest speaks.
struct SourceTranscribers {
    mic: StreamingTranscriber,
    system: StreamingTranscriber,
}

/// Speech is judged per 30 ms frame: a backlogged buffer spans pauses, and a pause flushes the line.
struct SourcePreview {
    speech: SpeechFrames,
    pipeline: StreamingPipeline,
}

impl SourcePreview {
    fn new(speech: SpeechFrames, cfg: StreamingConfig) -> Self {
        Self {
            speech,
            pipeline: StreamingPipeline::new(cfg),
        }
    }

    fn push<D: FnMut(&[f32]) -> String>(
        &mut self,
        samples: &[f32],
        decode: &mut D,
    ) -> Vec<PipelineEvent> {
        let Self { speech, pipeline } = self;
        let mut events = Vec::new();
        speech.push(samples, &mut |frame, is_speech| {
            events.extend(pipeline.push(frame, is_speech, decode));
        });
        events
    }
}

struct SourcePreviews {
    mic: SourcePreview,
    system: SourcePreview,
}

fn run_worker(
    app_handle: AppHandle,
    meeting_id: i64,
    transcribers: SourceTranscribers,
    mut previews: SourcePreviews,
    cmd_rx: mpsc::Receiver<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
) {
    debug!("streaming worker for meeting {meeting_id} entering main loop");

    let mut mic_chunks = 0usize;
    let mut sys_chunks = 0usize;
    let mut decode_errs = 0usize;
    let mut decode_oks = 0usize;
    let app_handle_for_decode = app_handle.clone();
    let mut decode_with = |transcriber: &StreamingTranscriber, samples: &[f32]| -> String {
        match transcriber.transcribe(samples.to_vec()) {
            Ok(text) => {
                decode_oks += 1;
                // Re-read so mid-meeting cleanup toggle takes effect.
                let settings_snapshot = settings::get_settings(&app_handle_for_decode);
                let cleaned =
                    clean_transcript(&text, HallucinationFilter::Strict, &settings_snapshot);
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
            let events = previews.mic.push(&mic_buf, &mut |samples| {
                decode_with(&transcribers.mic, samples)
            });
            emit_events(&app_handle, meeting_id, StreamingSource::Mic, events);
        }
        if !sys_buf.is_empty() {
            sys_chunks += 1;
            let events = previews.system.push(&sys_buf, &mut |samples| {
                decode_with(&transcribers.system, samples)
            });
            emit_events(&app_handle, meeting_id, StreamingSource::System, events);
        }
    }

    // Skip final flush: batch pass produces canonical segments; flush would dup + waste decode.

    info!(
        "streaming worker meeting={meeting_id} exiting (mic_chunks={mic_chunks} sys_chunks={sys_chunks} decode_ok={decode_oks} decode_err={decode_errs})"
    );
}

pub(super) fn emit_events(
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
#[path = "meeting_streaming_tests.rs"]
mod tests;
