//! Realtime preview pipeline for dictation (PTT) — single-source mirror of meeting_streaming.

use crate::audio_toolkit::CapturedAudioFrame;
use anyhow::Context;
use log::{debug, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// Upper bound on how long [`DictationStreamingHandle::stop_in_place`] waits for
/// the worker to exit. A single in-flight whisper FFI decode is non-cancellable
/// (the shutdown flag is only observed *between* decode batches), so past this
/// budget we detach the thread instead of blocking the caller. The orphan exits
/// on its own once the FFI returns and only ever touches `streaming_engine`,
/// never the main engine, so it cannot starve the post-stop final transcribe.
const WORKER_JOIN_BUDGET: Duration = Duration::from_millis(1500);
const WORKER_FINISH_BUDGET: Duration = Duration::from_secs(8);

use crate::managers::meeting_streaming::is_whisper_hallucination;
use crate::managers::model::transcription_profile_id;
use crate::managers::streaming::{PipelineEvent, StreamingConfig, StreamingPipeline};
use crate::managers::transcription::TranscriptionManager;
use crate::settings;

#[path = "dictation_accumulator.rs"]
mod dictation_accumulator;
pub use dictation_accumulator::DictationAccumulator;
enum Cmd {
    Audio(CapturedAudioFrame),
    Finish(mpsc::Sender<String>),
    Shutdown,
}

enum TerminalCommand {
    Finish(mpsc::Sender<String>),
    Shutdown,
}

struct CoalescedAudioBacklog {
    frames: Vec<CapturedAudioFrame>,
    terminal: Option<TerminalCommand>,
}

fn append_audio_frame(frames: &mut Vec<CapturedAudioFrame>, mut frame: CapturedAudioFrame) {
    if let Some(previous) = frames.last_mut() {
        if previous.is_speech == frame.is_speech {
            previous.samples.append(&mut frame.samples);
            return;
        }
    }
    frames.push(frame);
}

fn coalesce_audio_backlog(
    first: CapturedAudioFrame,
    receiver: &mpsc::Receiver<Cmd>,
) -> CoalescedAudioBacklog {
    let mut frames = Vec::new();
    append_audio_frame(&mut frames, first);
    let mut terminal = None;
    loop {
        match receiver.try_recv() {
            Ok(Cmd::Audio(frame)) => append_audio_frame(&mut frames, frame),
            Ok(Cmd::Finish(result_tx)) => {
                terminal = Some(TerminalCommand::Finish(result_tx));
                break;
            }
            Ok(Cmd::Shutdown) => {
                terminal = Some(TerminalCommand::Shutdown);
                break;
            }
            Err(mpsc::TryRecvError::Empty | mpsc::TryRecvError::Disconnected) => break,
        }
    }
    CoalescedAudioBacklog { frames, terminal }
}

/// Narrow seam between the streaming worker and the underlying engine.
/// Production impl lives on [`TranscriptionManager`]; tests inject scripted
/// decoders to drive lifecycle edge cases without a real model file.
pub trait DictationDecoder: Send + Sync + 'static {
    fn transcribe_chunk(&self, audio: Vec<f32>) -> anyhow::Result<String>;
}

/// Drain for live preview text. Production: emits a Tauri event. Tests: collect.
pub trait ProgressSink: Send + Sync + 'static {
    fn emit(&self, text: &str);
}

/// Production sink: forwards every interim/final to the overlay window.
pub struct AppHandleProgressSink {
    app_handle: AppHandle,
}

impl AppHandleProgressSink {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
}

impl ProgressSink for AppHandleProgressSink {
    fn emit(&self, text: &str) {
        crate::overlay::emit_transcription_progress(&self.app_handle, text);
    }
}

/// Skip-decoder used when no streaming engine is loaded. Falling back to the
/// main engine here contends `engine.lock()` with the post-stop final transcribe
/// and reproduces a 30s TimedOut on release; returning empty instead keeps the
/// main engine uncontested at the cost of disabling the live preview.
pub struct NoOpDecoder;

impl DictationDecoder for NoOpDecoder {
    fn transcribe_chunk(&self, _audio: Vec<f32>) -> anyhow::Result<String> {
        Ok(String::new())
    }
}

pub struct DictationStreamingWorker {
    cmd_tx: mpsc::Sender<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
}

/// Owns worker thread; consumed on stop. `on_cleanup` is injected so lifecycle is unit-testable.
pub struct DictationStreamingHandle {
    cmd_tx: mpsc::Sender<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
    join: Option<thread::JoinHandle<()>>,
    on_cleanup: Option<Box<dyn FnOnce() + Send>>,
}

/// Runs `on_cleanup` on drop unless `disarm`ed — guarantees keepalive release if thread spawn bails.
struct CleanupGuard(Option<Box<dyn FnOnce() + Send>>);

impl CleanupGuard {
    fn new(on_cleanup: Box<dyn FnOnce() + Send>) -> Self {
        Self(Some(on_cleanup))
    }

    /// Hands the closure to the caller; the guard no longer runs it on drop.
    fn disarm(mut self) -> Box<dyn FnOnce() + Send> {
        self.0.take().expect("CleanupGuard disarmed twice")
    }
}

impl Drop for CleanupGuard {
    fn drop(&mut self) {
        if let Some(cleanup) = self.0.take() {
            cleanup();
        }
    }
}

impl DictationStreamingWorker {
    /// Production entry point. Wires the TranscriptionManager + AppHandle into
    /// the injectable spawn path so the same code runs in tests with mocks.
    pub fn spawn(
        app_handle: AppHandle,
        transcription_manager: Arc<TranscriptionManager>,
    ) -> std::io::Result<(Arc<Self>, DictationStreamingHandle)> {
        let model_size = settings::get_settings(&app_handle).transcription_model_size;
        let realtime_model = transcription_profile_id(model_size).to_string();
        let streaming_loaded = if realtime_model.is_empty() {
            false
        } else {
            match transcription_manager.load_streaming_model(&realtime_model) {
                Ok(()) => true,
                Err(e) => {
                    warn!(
                        "Dictation: streaming model '{realtime_model}' unavailable ({e:#}); \
                         live preview disabled to keep the main engine uncontested"
                    );
                    false
                }
            }
        };

        let (decoder, on_cleanup): (Arc<dyn DictationDecoder>, Box<dyn FnOnce() + Send>) =
            if streaming_loaded {
                (transcription_manager, Box::new(|| {}))
            } else {
                let noop: Box<dyn FnOnce() + Send> = Box::new(|| {});
                (Arc::new(NoOpDecoder), noop)
            };

        let sink: Arc<dyn ProgressSink> = Arc::new(AppHandleProgressSink::new(app_handle));
        let result =
            Self::spawn_with_decoder(decoder, sink, on_cleanup, StreamingConfig::default());
        if result.is_ok() {
            info!(
                "Dictation streaming worker started (streaming_loaded={streaming_loaded}, \
                 realtime_model={realtime_model})"
            );
        }
        result
    }

    /// Injectable spawn — used by tests and by [`spawn`] alike. Decoder + sink
    /// are the only contact with the outside world; cleanup runs exactly once
    /// on stop or Drop.
    pub fn spawn_with_decoder(
        decoder: Arc<dyn DictationDecoder>,
        sink: Arc<dyn ProgressSink>,
        on_cleanup: Box<dyn FnOnce() + Send>,
        cfg: StreamingConfig,
    ) -> std::io::Result<(Arc<Self>, DictationStreamingHandle)> {
        // If the `?` below bails, the guard drops and runs on_cleanup — releasing the keepalive
        // acquired in spawn() before this call, which would otherwise leak forever.
        let cleanup_guard = CleanupGuard::new(on_cleanup);
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let decoder_for_thread = decoder.clone();
        let sink_for_thread = sink.clone();
        let shutdown_for_thread = shutdown_flag.clone();
        let join = thread::Builder::new()
            .name("dictation-streaming".to_string())
            .spawn(move || {
                run_worker(
                    decoder_for_thread,
                    sink_for_thread,
                    cmd_rx,
                    shutdown_for_thread,
                    cfg,
                );
            })?;
        let worker = Arc::new(Self {
            cmd_tx: cmd_tx.clone(),
            shutdown_flag: shutdown_flag.clone(),
        });
        let handle = DictationStreamingHandle {
            cmd_tx,
            shutdown_flag,
            join: Some(join),
            on_cleanup: Some(cleanup_guard.disarm()),
        };
        Ok((worker, handle))
    }

    /// 16 kHz mono f32. No-op after shutdown.
    pub fn push_frame(&self, frame: CapturedAudioFrame) {
        if frame.samples.is_empty() || self.shutdown_flag.load(Ordering::Relaxed) {
            return;
        }
        let _ = self.cmd_tx.send(Cmd::Audio(frame));
    }
}

impl DictationStreamingHandle {
    pub fn finish(mut self) -> anyhow::Result<String> {
        let (result_tx, result_rx) = mpsc::channel();
        self.cmd_tx
            .send(Cmd::Finish(result_tx))
            .context("finish dictation streaming worker")?;
        let transcript = match result_rx.recv_timeout(WORKER_FINISH_BUDGET) {
            Ok(transcript) => transcript,
            Err(error) => {
                self.stop_in_place();
                return Err(anyhow::anyhow!(
                    "dictation streaming finish failed: {error}"
                ));
            }
        };
        self.join_finished_worker()?;
        self.run_cleanup();
        Ok(transcript)
    }

    /// Releases streaming engine + keepalive. Shutdown flag short-circuits in-flight decodes.
    pub fn stop(mut self) {
        self.stop_in_place();
    }

    /// Idempotent: stop+Drop or double stop both safe.
    ///
    /// Bounded: the worker only checks `shutdown_flag` *between* decode batches,
    /// so a single in-flight whisper FFI decode cannot be preempted. Rather than
    /// block the caller (and through it the un-abortable stop-flow task) on an
    /// unbounded `h.join()`, we poll for [`WORKER_JOIN_BUDGET`] then detach the
    /// thread. The orphan finishes on its own and only touches `streaming_engine`,
    /// so it can never starve the main-engine final transcribe.
    fn stop_in_place(&mut self) {
        if self.join.is_none() && self.on_cleanup.is_none() {
            return;
        }
        self.shutdown_flag.store(true, Ordering::SeqCst);
        let _ = self.cmd_tx.send(Cmd::Shutdown);
        self.join_cancelled_worker();
        self.run_cleanup();
    }

    fn join_finished_worker(&mut self) -> anyhow::Result<()> {
        let Some(handle) = self.join.take() else {
            return Ok(());
        };
        handle
            .join()
            .map_err(|error| anyhow::anyhow!("dictation streaming worker panicked: {error:?}"))
    }

    fn join_cancelled_worker(&mut self) {
        let Some(handle) = self.join.take() else {
            return;
        };
        let deadline = Instant::now() + WORKER_JOIN_BUDGET;
        while !handle.is_finished() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(25));
        }
        if handle.is_finished() {
            if let Err(error) = handle.join() {
                warn!("dictation streaming worker thread panicked: {error:?}");
            }
            return;
        }
        warn!(
            "dictation streaming worker still decoding after {:?}; detaching",
            WORKER_JOIN_BUDGET
        );
    }

    fn run_cleanup(&mut self) {
        if let Some(cleanup) = self.on_cleanup.take() {
            cleanup();
        }
    }
}

impl Drop for DictationStreamingHandle {
    fn drop(&mut self) {
        // Safety net: signal shutdown and release the keepalive even if the
        // owner forgot to call stop() (bounded — see stop_in_place).
        if self.join.is_some() || self.on_cleanup.is_some() {
            self.stop_in_place();
        }
    }
}

/// Lets pipeline.push bail mid-decode batch; otherwise h.join() blocks past 30s timeout floor.
fn decode_or_skip_on_shutdown<F>(
    shutdown_flag: &AtomicBool,
    samples: &[f32],
    decode_errs: &mut usize,
    f: F,
) -> String
where
    F: FnOnce(&[f32]) -> Result<String, anyhow::Error>,
{
    if shutdown_flag.load(Ordering::Relaxed) {
        return String::new();
    }
    match f(samples) {
        Ok(text) => {
            if is_whisper_hallucination(&text) {
                String::new()
            } else {
                text
            }
        }
        Err(e) => {
            *decode_errs += 1;
            if *decode_errs <= 3 || decode_errs.is_multiple_of(50) {
                warn!("dictation streaming decode failed (#{decode_errs}): {e:#}");
            }
            String::new()
        }
    }
}

fn run_worker(
    decoder: Arc<dyn DictationDecoder>,
    sink: Arc<dyn ProgressSink>,
    cmd_rx: mpsc::Receiver<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
    cfg: StreamingConfig,
) {
    let mut pipeline = StreamingPipeline::new(cfg);
    let mut accumulator = DictationAccumulator::new();
    let mut decode_errs = 0usize;

    let decoder_for_decode = decoder.clone();
    let shutdown_for_decode = shutdown_flag.clone();
    let mut decode = move |samples: &[f32]| -> String {
        decode_or_skip_on_shutdown(&shutdown_for_decode, samples, &mut decode_errs, |s| {
            decoder_for_decode.transcribe_chunk(s.to_vec())
        })
    };

    while let Ok(command) = cmd_rx.recv() {
        let backlog = match command {
            Cmd::Audio(frame) => coalesce_audio_backlog(frame, &cmd_rx),
            Cmd::Finish(result_tx) => CoalescedAudioBacklog {
                frames: Vec::new(),
                terminal: Some(TerminalCommand::Finish(result_tx)),
            },
            Cmd::Shutdown => CoalescedAudioBacklog {
                frames: Vec::new(),
                terminal: Some(TerminalCommand::Shutdown),
            },
        };
        for frame in backlog.frames {
            if shutdown_flag.load(Ordering::Relaxed) {
                break;
            }
            let events = pipeline.push(&frame.samples, frame.is_speech, &mut decode);
            emit_events(events, &mut accumulator, &sink);
        }
        match backlog.terminal {
            Some(TerminalCommand::Finish(result_tx)) => {
                emit_events(pipeline.flush(&mut decode), &mut accumulator, &sink);
                let _ = result_tx.send(accumulator.transcript());
                break;
            }
            Some(TerminalCommand::Shutdown) => break,
            None => {}
        }
    }
    debug!("dictation streaming worker exiting");
}

fn emit_events(
    events: Vec<PipelineEvent>,
    accumulator: &mut DictationAccumulator,
    sink: &Arc<dyn ProgressSink>,
) {
    for event in events {
        if let Some(display) = accumulator.push(event) {
            sink.emit(&display);
        }
    }
}

#[cfg(test)]
include!("dictation_streaming_tests.rs");
