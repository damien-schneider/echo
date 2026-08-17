//! Realtime preview pipeline for dictation (PTT).

use crate::audio_toolkit::CapturedAudioFrame;
use anyhow::Context;
use log::{debug, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// Whisper FFI decode is non-cancellable — past this budget the worker thread is detached, not joined.
const WORKER_JOIN_BUDGET: Duration = Duration::from_millis(1500);
const WORKER_FINISH_BUDGET: Duration = Duration::from_secs(8);

use crate::managers::meeting_streaming::is_whisper_hallucination;
use crate::managers::model::transcription_profile_id;
use crate::managers::streaming::{PipelineEvent, StreamingConfig, StreamingPipeline};
use crate::managers::transcription::{StreamingTranscriber, TranscriptionManager};
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

/// Seam so tests can script decodes without a real model file.
pub trait DictationDecoder: Send + Sync + 'static {
    fn transcribe_chunk(&self, audio: Vec<f32>) -> anyhow::Result<String>;
    fn observe_audio(&self, _samples: &[f32], _is_speech: bool) {}
    fn language_is_pinned(&self) -> bool {
        true
    }
}

pub trait ProgressSink: Send + Sync + 'static {
    fn emit(&self, text: &str);
}

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

/// No streaming engine — returns empty rather than contend `engine.lock()` with the final transcribe.
pub struct NoOpDecoder;

impl DictationDecoder for NoOpDecoder {
    fn transcribe_chunk(&self, _audio: Vec<f32>) -> anyhow::Result<String> {
        Ok(String::new())
    }
}

impl DictationDecoder for StreamingTranscriber {
    fn observe_audio(&self, samples: &[f32], is_speech: bool) {
        StreamingTranscriber::observe_audio(self, samples, is_speech);
    }

    fn language_is_pinned(&self) -> bool {
        StreamingTranscriber::language_is_pinned(self)
    }

    fn transcribe_chunk(&self, audio: Vec<f32>) -> anyhow::Result<String> {
        self.transcribe(audio)
    }
}

pub struct DictationStreamingWorker {
    cmd_tx: mpsc::Sender<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
}

pub struct DictationStreamingHandle {
    cmd_tx: mpsc::Sender<Cmd>,
    shutdown_flag: Arc<AtomicBool>,
    join: Option<thread::JoinHandle<()>>,
    on_cleanup: Option<Box<dyn FnOnce() + Send>>,
}

/// Runs `on_cleanup` on drop unless `disarm`ed — releases keepalive if thread spawn bails.
struct CleanupGuard(Option<Box<dyn FnOnce() + Send>>);

impl CleanupGuard {
    fn new(on_cleanup: Box<dyn FnOnce() + Send>) -> Self {
        Self(Some(on_cleanup))
    }

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
    pub fn spawn(
        app_handle: AppHandle,
        transcription_manager: Arc<TranscriptionManager>,
    ) -> std::io::Result<(Arc<Self>, DictationStreamingHandle)> {
        let settings = settings::get_settings(&app_handle);
        let realtime_model =
            transcription_profile_id(settings.transcription_model_size).to_string();
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
                let transcriber =
                    StreamingTranscriber::new(transcription_manager, &settings.selected_language)
                        .map_err(std::io::Error::other)?;
                (Arc::new(transcriber), Box::new(|| {}))
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

    /// Cleanup runs exactly once, on stop or Drop.
    pub fn spawn_with_decoder(
        decoder: Arc<dyn DictationDecoder>,
        sink: Arc<dyn ProgressSink>,
        on_cleanup: Box<dyn FnOnce() + Send>,
        cfg: StreamingConfig,
    ) -> std::io::Result<(Arc<Self>, DictationStreamingHandle)> {
        // `?` below bails → guard drops → keepalive acquired in spawn() released, not leaked
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

    /// Idempotent. Bounded by [`WORKER_JOIN_BUDGET`] — an un-preemptable decode gets detached, never joined.
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
        // owner may have skipped stop() — release keepalive anyway
        if self.join.is_some() || self.on_cleanup.is_some() {
            self.stop_in_place();
        }
    }
}

/// Lets pipeline.push bail mid-batch; without it `h.join()` blocks past the 30s timeout floor.
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
            decoder.observe_audio(&frame.samples, frame.is_speech);
            let is_speech = frame.is_speech || !decoder.language_is_pinned();
            let events = pipeline.push(&frame.samples, is_speech, &mut decode);
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
