//! Dual-stream meeting recording (mic + system), chunked transcription, diarization, lifecycle.

use anyhow::{Context, Result};
use chrono::Utc;
use log::{debug, error, info, warn};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

use super::database;
use super::diarization::DiarizationManager;
use super::meeting_streaming::{
    is_whisper_hallucination, StreamingSource, StreamingWorker, StreamingWorkerHandle,
};
use super::transcription::{transcription_timeout, TranscribeError, TranscriptionManager};
use crate::audio_toolkit::audio::system_capture::{
    create_system_capture, is_system_audio_available, SystemAudioCapture,
};
use crate::audio_toolkit::audio::{
    create_wav_file, read_wav_range, write_wav_samples, WavSink, WavWindows,
};
use crate::audio_toolkit::{list_input_devices, AudioRecorder};
use crate::commands::cleanup::{build_context_from_app_settings, CleanupState};
use crate::helpers::clamshell;
use crate::managers::cleanup_apply::cleanup_or_filter;
use crate::settings;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MeetingStatus {
    Recording,
    Processing,
    Complete,
    Error,
}

impl MeetingStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            MeetingStatus::Recording => "recording",
            MeetingStatus::Processing => "processing",
            MeetingStatus::Complete => "complete",
            MeetingStatus::Error => "error",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "recording" => MeetingStatus::Recording,
            "processing" => MeetingStatus::Processing,
            "complete" => MeetingStatus::Complete,
            "error" => MeetingStatus::Error,
            _ => MeetingStatus::Error,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    Mic,
    System,
}

impl AudioSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            AudioSource::Mic => "mic",
            AudioSource::System => "system",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub id: i64,
    pub title: String,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub duration_ms: Option<i64>,
    pub mic_file_name: Option<String>,
    pub system_file_name: Option<String>,
    pub summary: Option<String>,
    pub status: MeetingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSegment {
    pub id: i64,
    pub meeting_id: i64,
    pub speaker_label: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
    pub confidence: Option<f64>,
    pub audio_source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchPhase {
    Transcribing,
    /// Sortformer pass on full WAV before per-segment decode.
    Diarizing,
    Done,
}

#[derive(Debug, Clone, Serialize)]
pub struct MeetingBatchProgress {
    pub meeting_id: i64,
    pub source: String,
    pub phase: BatchPhase,
    pub chunks_done: usize,
    pub chunks_total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Srt,
    Vtt,
    Txt,
    Markdown,
}

const DIARIZATION_WINDOW_SAMPLES: usize = 30 * 16_000;

/// Whisper decode is non-cancellable: a timed-out chunk keeps running on its own decode state, so
/// queueing the next one stacks live states until the machine runs out of memory. Two in a row means
/// this machine cannot decode faster than the meeting was recorded — stop instead of piling up.
const MAX_CONSECUTIVE_DECODE_TIMEOUTS: usize = 2;

struct RecordingState {
    meeting_id: i64,
    start_time: i64,
}

enum ManagerState {
    Idle,
    Recording(RecordingState),
    Processing,
}

pub struct MeetingManager {
    app_handle: AppHandle,
    state: Arc<Mutex<ManagerState>>,
    meetings_dir: PathBuf,
    db_path: PathBuf,
    /// No VAD — captures everything.
    mic_recorder: Arc<std::sync::Mutex<Option<AudioRecorder>>>,
    system_capture: Arc<std::sync::Mutex<Option<Box<dyn SystemAudioCapture>>>>,
    mic_sink: Arc<std::sync::Mutex<Option<MeetingAudioSink>>>,
    mic_collector: Arc<std::sync::Mutex<Option<std::thread::JoinHandle<()>>>>,
    system_sink: Arc<std::sync::Mutex<Option<MeetingAudioSink>>>,
    system_collector: Arc<std::sync::Mutex<Option<std::thread::JoinHandle<()>>>>,
    streaming_worker: Arc<std::sync::Mutex<Option<Arc<StreamingWorker>>>>,
    /// Owned separately so we can join even when forwarders still hold Arc clones.
    streaming_handle: Arc<std::sync::Mutex<Option<StreamingWorkerHandle>>>,
}

impl MeetingManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle.path().app_data_dir()?;
        let meetings_dir = app_data_dir.join("meetings");
        let db_path = app_data_dir.join("history.db");

        if !meetings_dir.exists() {
            fs::create_dir_all(&meetings_dir)?;
            debug!("Created meetings directory: {:?}", meetings_dir);
        }

        // HistoryManager already calls initialize_database; re-verify our tables exist.
        database::initialize_database(&db_path)
            .context("Failed to initialize database for meetings")?;

        Ok(Self {
            app_handle: app_handle.clone(),
            state: Arc::new(Mutex::new(ManagerState::Idle)),
            meetings_dir,
            db_path,
            mic_recorder: Arc::new(std::sync::Mutex::new(None)),
            system_capture: Arc::new(std::sync::Mutex::new(None)),
            mic_sink: Arc::new(std::sync::Mutex::new(None)),
            mic_collector: Arc::new(std::sync::Mutex::new(None)),
            system_sink: Arc::new(std::sync::Mutex::new(None)),
            system_collector: Arc::new(std::sync::Mutex::new(None)),
            streaming_worker: Arc::new(std::sync::Mutex::new(None)),
            streaming_handle: Arc::new(std::sync::Mutex::new(None)),
        })
    }

    fn get_connection(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)
            .with_context(|| format!("Failed to open database at {:?}", self.db_path))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .context("Failed to enable foreign keys")?;
        Ok(conn)
    }

    /// Resolves from settings; honours clamshell mode.
    fn get_effective_mic_device(&self) -> Option<cpal::Device> {
        let app_settings = settings::get_settings(&self.app_handle);

        let should_use_clamshell = if app_settings.clamshell_microphone.is_some() {
            clamshell::is_clamshell().unwrap_or(false)
        } else {
            false
        };

        let device_name = if should_use_clamshell {
            app_settings.clamshell_microphone.as_deref()
        } else {
            app_settings.selected_microphone.as_deref()
        }?;

        match list_input_devices() {
            Ok(devices) => devices
                .into_iter()
                .find(|d| d.name == device_name)
                .map(|d| d.device),
            Err(e) => {
                debug!("Failed to list devices, using default: {}", e);
                None
            }
        }
    }

    /// Releases everything `start_meeting` may have opened before it failed — a half-started meeting
    /// otherwise keeps the microphone, the system capture and the streaming worker alive for good.
    fn abort_start(&self) {
        if let Some(mut recorder) = self.mic_recorder.lock().unwrap().take() {
            let _ = recorder.close();
        }
        if let Some(mut capture) = self.system_capture.lock().unwrap().take() {
            let _ = capture.stop();
        }
        if let Some(handle) = self.system_collector.lock().unwrap().take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.mic_collector.lock().unwrap().take() {
            let _ = handle.join();
        }
        for sink in [&self.mic_sink, &self.system_sink] {
            if let Some(sink) = sink.lock().unwrap().take() {
                sink.finish(&self.meetings_dir);
            }
        }
        let _ = self.streaming_worker.lock().unwrap().take();
        if let Some(handle) = self.streaming_handle.lock().unwrap().take() {
            handle.stop();
        }
    }

    pub async fn start_meeting(&self, title: Option<String>) -> Result<i64> {
        let mut state = self.state.lock().await;
        if !matches!(*state, ManagerState::Idle) {
            anyhow::bail!("A meeting is already in progress");
        }

        let diarization_available = self
            .app_handle
            .try_state::<Arc<DiarizationManager>>()
            .map(|dm| dm.is_available())
            .unwrap_or(false);
        if !diarization_available {
            anyhow::bail!(
                "Download the speaker detection model in Meeting Settings before starting a meeting."
            );
        }

        let mut recorder = AudioRecorder::new()
            .map_err(|e| anyhow::anyhow!("Failed to create meeting audio recorder: {}", e))?;

        let selected_device = self.get_effective_mic_device();
        recorder
            .open(selected_device)
            .map_err(|e| anyhow::anyhow!("Failed to open microphone for meeting: {}", e))?;

        // ID needed up front for streaming events + file names.
        let now = Utc::now().timestamp();
        let meeting_title = title.unwrap_or_else(|| {
            let dt = chrono::Local::now();
            format!("Meeting {}", dt.format("%b %d, %H:%M"))
        });
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO meetings (title, start_time, status) VALUES (?1, ?2, ?3)",
            params![meeting_title, now, MeetingStatus::Recording.as_str()],
        )?;
        let meeting_id = conn.last_insert_rowid();
        info!("Started meeting {} (id={})", meeting_title, meeting_id);

        // Spawn BEFORE chunk_tx wire so first sample hits live worker.
        let app_settings = settings::get_settings(&self.app_handle);
        let streaming_worker_arc = {
            let tm = self.app_handle.state::<Arc<TranscriptionManager>>();
            match StreamingWorker::spawn(self.app_handle.clone(), meeting_id, tm.inner().clone()) {
                Ok((arc, handle)) => {
                    *self.streaming_worker.lock().unwrap() = Some(arc.clone());
                    *self.streaming_handle.lock().unwrap() = Some(handle);
                    info!("Realtime streaming worker started for meeting {meeting_id}");
                    Some(arc)
                }
                Err(e) => {
                    warn!("Failed to spawn streaming worker: {e:#}");
                    None
                }
            }
        };

        let (mic_tx, mic_rx) =
            std::sync::mpsc::channel::<crate::audio_toolkit::CapturedAudioFrame>();
        *self.mic_sink.lock().unwrap() = Some(
            MeetingAudioSink::create(
                &self.meetings_dir,
                format!("meeting-{}-mic.wav", meeting_id),
            )
            .inspect_err(|_| self.abort_start())?,
        );
        {
            let sink = self.mic_sink.clone();
            let worker_for_collector = streaming_worker_arc.clone();
            let handle = std::thread::Builder::new()
                .name(format!("meeting-mic-collector-{meeting_id}"))
                .spawn(move || {
                    while let Ok(frame) = mic_rx.recv() {
                        write_to_sink(&sink, "Mic", &frame.samples);
                        if let Some(ref worker) = worker_for_collector {
                            worker.push_audio(StreamingSource::Mic, frame.samples);
                        }
                    }
                })
                .map_err(|e| {
                    self.abort_start();
                    anyhow::anyhow!("spawn mic collector: {e}")
                })?;
            *self.mic_collector.lock().unwrap() = Some(handle);
        }

        recorder.start_streaming(mic_tx).map_err(|e| {
            self.abort_start();
            anyhow::anyhow!("Failed to start microphone recording: {}", e)
        })?;

        info!("Meeting microphone stream started");

        {
            let mut rec_guard = self.mic_recorder.lock().unwrap();
            *rec_guard = Some(recorder);
        }

        if app_settings.meeting_system_audio_enabled && is_system_audio_available() {
            match create_system_capture() {
                Ok(mut capture) => match capture.start() {
                    Ok(rx) => {
                        let sink = MeetingAudioSink::create(
                            &self.meetings_dir,
                            format!("meeting-{}-system.wav", meeting_id),
                        )
                        .inspect_err(|_| {
                            let _ = capture.stop();
                            self.abort_start();
                        })?;
                        *self.system_sink.lock().unwrap() = Some(sink);
                        let acc = self.system_sink.clone();
                        let worker_for_collector = streaming_worker_arc.clone();
                        let handle = std::thread::Builder::new()
                            .name("meeting-system-capture-collector".into())
                            .spawn(move || {
                                while let Ok(chunk) = rx.recv() {
                                    write_to_sink(&acc, "System", &chunk);
                                    if let Some(ref worker) = worker_for_collector {
                                        worker.push_audio(StreamingSource::System, chunk);
                                    }
                                }
                            })
                            .map_err(|e| {
                                let _ = capture.stop();
                                self.abort_start();
                                anyhow::anyhow!("spawn system capture collector: {e}")
                            })?;
                        *self.system_capture.lock().unwrap() = Some(capture);
                        *self.system_collector.lock().unwrap() = Some(handle);
                        info!("Meeting system audio stream started");
                    }
                    Err(e) => {
                        warn!("Failed to start system audio capture: {e:#}");
                    }
                },
                Err(e) => {
                    warn!("Failed to construct system audio capture: {e:#}");
                }
            }
        }

        *state = ManagerState::Recording(RecordingState {
            meeting_id,
            start_time: now,
        });

        self.emit_status_changed(MeetingStatus::Recording);

        Ok(meeting_id)
    }

    /// Returns when WAVs written + status=processing; batch pass spawned to runtime.
    pub async fn stop_meeting(self: Arc<Self>) -> Result<()> {
        let recording = {
            let mut state = self.state.lock().await;
            match std::mem::replace(&mut *state, ManagerState::Processing) {
                ManagerState::Recording(rs) => rs,
                other => {
                    *state = other;
                    anyhow::bail!("No meeting is currently recording");
                }
            }
        };

        self.emit_status_changed(MeetingStatus::Processing);

        let result = self.clone().finish_recording(recording).await;
        if let Err(ref error) = result {
            error!("Failed to finish meeting recording: {error:#}");
            // `Processing` is only left by the batch pass, which never runs now — releasing the
            // state here is what keeps the next meeting startable without an app restart.
            *self.state.lock().await = ManagerState::Idle;
            self.emit_status_changed(MeetingStatus::Error);
        }
        result
    }

    /// Streams are torn down before any fallible I/O — a failed WAV write must not leave the
    /// microphone, the system capture, or the streaming worker running.
    async fn finish_recording(self: Arc<Self>, recording: RecordingState) -> Result<()> {
        let mic_file = {
            {
                let mut rec_guard = self.mic_recorder.lock().unwrap();
                if let Some(mut recorder) = rec_guard.take() {
                    if let Err(e) = recorder.stop() {
                        error!("Failed to stop meeting mic recorder: {}", e);
                    }
                    // Closing drops the frame sender, which is what ends the collector below.
                    let _ = recorder.close();
                } else {
                    warn!("No mic recorder was active for meeting");
                }
            }
            if let Some(handle) = self.mic_collector.lock().unwrap().take() {
                let _ = handle.join();
            }
            self.mic_sink
                .lock()
                .unwrap()
                .take()
                .and_then(|sink| sink.finish(&self.meetings_dir))
        };

        let sys_file = {
            if let Some(mut capture) = self.system_capture.lock().unwrap().take() {
                if let Err(e) = capture.stop() {
                    warn!("Failed to stop system audio capture: {e:#}");
                }
            }
            if let Some(handle) = self.system_collector.lock().unwrap().take() {
                let _ = handle.join();
            }
            self.system_sink
                .lock()
                .unwrap()
                .take()
                .and_then(|sink| sink.finish(&self.meetings_dir))
        };

        // Drop shared Arc first so forwarder push_audio becomes no-op; then Shutdown + join.
        let _ = self.streaming_worker.lock().unwrap().take();
        if let Some(handle) = self.streaming_handle.lock().unwrap().take() {
            handle.stop();
        }

        let now = Utc::now().timestamp();
        let duration_ms = (now - recording.start_time) * 1000;
        let meeting_id = recording.meeting_id;

        // Status flips to `complete` after spawned batch decode finishes.
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE meetings SET end_time = ?1, duration_ms = ?2, mic_file_name = ?3, system_file_name = ?4, status = ?5 WHERE id = ?6",
            params![
                now,
                duration_ms,
                mic_file,
                sys_file,
                MeetingStatus::Processing.as_str(),
                meeting_id,
            ],
        )?;

        let manager = self.clone();
        let (mic_batch, sys_batch) = (mic_file.clone(), sys_file.clone());
        tauri::async_runtime::spawn(async move {
            manager
                .run_batch_transcription(meeting_id, mic_batch, sys_batch)
                .await;
        });

        Ok(())
    }

    /// Detached from stop_meeting; errors logged to status, never propagated.
    async fn run_batch_transcription(
        self: Arc<Self>,
        meeting_id: i64,
        mic_file: Option<String>,
        sys_file: Option<String>,
    ) {
        if let Some(name) = mic_file {
            let path = self.meetings_dir.join(name);
            match wav_sample_count(&path) {
                Ok(total) => {
                    self.diarize_and_transcribe(meeting_id, &path, total, AudioSource::Mic)
                        .await;
                }
                Err(e) => error!("Failed to open meeting mic audio: {e:#}"),
            }
        }
        if let Some(name) = sys_file {
            let path = self.meetings_dir.join(name);
            match wav_sample_count(&path) {
                Ok(total) => {
                    self.transcribe_samples(
                        meeting_id,
                        &path,
                        total,
                        "System",
                        AudioSource::System,
                    )
                    .await;
                }
                Err(e) => error!("Failed to open meeting system audio: {e:#}"),
            }
        }

        if let Ok(conn) = self.get_connection() {
            if let Err(e) = conn.execute(
                "UPDATE meetings SET status = ?1 WHERE id = ?2",
                params![MeetingStatus::Complete.as_str(), meeting_id],
            ) {
                error!("Failed to mark meeting {} complete: {}", meeting_id, e);
            }
        }

        {
            let mut state = self.state.lock().await;
            *state = ManagerState::Idle;
        }

        self.emit_status_changed(MeetingStatus::Complete);
        info!("Meeting {} completed", meeting_id);

        let app_settings = settings::get_settings(&self.app_handle);
        if app_settings.meeting_auto_summary {
            let _ = self
                .app_handle
                .emit("meeting-auto-summary-requested", meeting_id);
        }
    }

    /// Reads the recording chunk by chunk: batch passes must not scale with meeting length.
    async fn transcribe_samples(
        &self,
        meeting_id: i64,
        audio: &Path,
        total_samples: usize,
        speaker_label: &str,
        source: AudioSource,
    ) {
        let chunk_secs = {
            let s = settings::get_settings(&self.app_handle);
            s.meeting_chunk_duration_secs.max(10) as usize
        };
        let plan = chunk_plan(total_samples, chunk_secs);
        let chunk_size = plan.chunk_size;
        let step = plan.step;
        let chunks_total = plan.chunks_total;

        let transcription_manager = self.app_handle.state::<Arc<TranscriptionManager>>();

        transcription_manager.initiate_model_load();

        let emit_progress = |chunks_done: usize, phase: BatchPhase| {
            let _ = self.app_handle.emit(
                "meeting-batch-progress",
                MeetingBatchProgress {
                    meeting_id,
                    source: source.as_str().to_string(),
                    phase,
                    chunks_done,
                    chunks_total,
                },
            );
        };

        emit_progress(0, BatchPhase::Transcribing);

        let mut offset_ms: i64 = 0;
        let mut pos = 0;
        let mut chunks_done = 0usize;
        let mut consecutive_timeouts = 0usize;

        while pos < total_samples {
            let end = (pos + chunk_size).min(total_samples);
            let chunk = match read_wav_range(audio, pos, end) {
                Ok(chunk) => chunk,
                Err(e) => {
                    error!("Failed to read meeting audio at {}ms: {e:#}", offset_ms);
                    break;
                }
            };
            let chunk_len = chunk.len();

            match transcription_manager
                .transcribe_with_timeout(chunk, transcription_timeout(chunk_len))
            {
                Ok(text) if !text.trim().is_empty() => {
                    consecutive_timeouts = 0;
                    let trimmed = text.trim().to_string();
                    let final_text = self.apply_cleanup_filter(&trimmed);
                    if final_text.is_empty() {
                        debug!(
                            "Skipped chunk at {}ms (empty or hallucination): {:?}",
                            offset_ms, trimmed
                        );
                    } else {
                        let chunk_duration_ms = ((end - pos) as i64 * 1000) / 16_000;
                        let segment = MeetingSegment {
                            id: 0,
                            meeting_id,
                            speaker_label: speaker_label.to_string(),
                            start_ms: offset_ms,
                            end_ms: offset_ms + chunk_duration_ms,
                            text: final_text,
                            confidence: None,
                            audio_source: source.as_str().to_string(),
                        };
                        if let Err(e) = self.insert_segment(&segment) {
                            error!("Failed to insert meeting segment: {}", e);
                        } else {
                            let _ = self.app_handle.emit("meeting-segment-added", &segment);
                        }
                    }
                }
                Ok(text) => {
                    consecutive_timeouts = 0;
                    debug!(
                        "Skipped chunk at {}ms (empty or hallucination): {:?}",
                        offset_ms,
                        text.trim()
                    );
                }
                Err(e) => {
                    error!(
                        "Failed to transcribe meeting chunk at {}ms: {}",
                        offset_ms, e
                    );
                    if matches!(e, TranscribeError::TimedOut) {
                        consecutive_timeouts += 1;
                        if consecutive_timeouts >= MAX_CONSECUTIVE_DECODE_TIMEOUTS {
                            error!(
                                "Abandoning batch transcription after {consecutive_timeouts} \
                                 consecutive decode timeouts — the remaining audio would only \
                                 stack more orphaned decodes"
                            );
                            break;
                        }
                    }
                }
            }

            chunks_done += 1;
            emit_progress(chunks_done, BatchPhase::Transcribing);

            let advance = if end < total_samples { step } else { end - pos };
            offset_ms += (advance as i64 * 1000) / 16_000;
            pos += advance;
        }

        emit_progress(chunks_done, BatchPhase::Done);
    }

    fn apply_cleanup_filter(&self, text: &str) -> String {
        let settings = settings::get_settings(&self.app_handle);
        let cleanup_state = match self.app_handle.try_state::<CleanupState>() {
            Some(s) => s.inner().clone(),
            None => {
                // Test harness: hallucination filter only.
                if is_whisper_hallucination(text) {
                    return String::new();
                }
                return text.to_string();
            }
        };
        cleanup_or_filter(text, &cleanup_state, &settings, || {
            build_context_from_app_settings(&settings)
        })
    }

    /// Falls back to chunked transcription on failure.
    async fn diarize_and_transcribe(
        &self,
        meeting_id: i64,
        audio: &Path,
        total_samples: usize,
        source: AudioSource,
    ) {
        let diarization_manager = match self.app_handle.try_state::<Arc<DiarizationManager>>() {
            Some(dm) => dm.inner().clone(),
            None => {
                warn!("DiarizationManager not available, falling back to chunked transcription");
                self.transcribe_samples(meeting_id, audio, total_samples, "Speaker", source)
                    .await;
                return;
            }
        };

        let emit_progress = |chunks_done: usize, chunks_total: usize, phase: BatchPhase| {
            let _ = self.app_handle.emit(
                "meeting-batch-progress",
                MeetingBatchProgress {
                    meeting_id,
                    source: source.as_str().to_string(),
                    phase,
                    chunks_done,
                    chunks_total,
                },
            );
        };

        emit_progress(0, 0, BatchPhase::Diarizing);

        let threshold = {
            let s = settings::get_settings(&self.app_handle);
            s.meeting_diarization_threshold
        };

        let diarization_result = WavWindows::open(audio, DIARIZATION_WINDOW_SAMPLES)
            .and_then(|windows| diarization_manager.diarize(windows, threshold));

        let raw_segments = match diarization_result {
            Ok(segs) => segs,
            Err(e) => {
                error!(
                    "Diarization failed, falling back to chunked transcription: {}",
                    e
                );
                self.transcribe_samples(meeting_id, audio, total_samples, "Speaker", source)
                    .await;
                return;
            }
        };

        if raw_segments.is_empty() {
            warn!("Diarization returned no segments, falling back to chunked transcription");
            self.transcribe_samples(meeting_id, audio, total_samples, "Speaker", source)
                .await;
            return;
        }

        // 30s cap for transcription context.
        let merged = DiarizationManager::merge_consecutive(&raw_segments, 30_000);

        let transcription_manager = self.app_handle.state::<Arc<TranscriptionManager>>();
        transcription_manager.initiate_model_load();

        let sample_rate: i64 = 16_000;
        let min_samples: usize = 1600;

        let chunks_total = merged.len();
        emit_progress(0, chunks_total, BatchPhase::Transcribing);
        let mut consecutive_timeouts = 0usize;

        for (idx, seg) in merged.iter().enumerate() {
            let start_sample = (seg.start_ms * sample_rate / 1000) as usize;
            let end_sample = ((seg.end_ms * sample_rate / 1000) as usize).min(total_samples);

            if end_sample <= start_sample || (end_sample - start_sample) < min_samples {
                emit_progress(idx + 1, chunks_total, BatchPhase::Transcribing);
                continue;
            }

            let chunk = match read_wav_range(audio, start_sample, end_sample) {
                Ok(chunk) => chunk,
                Err(e) => {
                    error!(
                        "Failed to read diarized segment at {}ms: {e:#}",
                        seg.start_ms
                    );
                    break;
                }
            };

            match transcription_manager
                .transcribe_with_timeout(chunk.to_vec(), transcription_timeout(chunk.len()))
            {
                Ok(text) if !text.trim().is_empty() => {
                    consecutive_timeouts = 0;
                    let trimmed = text.trim().to_string();
                    let final_text = self.apply_cleanup_filter(&trimmed);
                    if final_text.is_empty() {
                        debug!(
                            "Skipped diarized segment at {}ms (empty or hallucination): {:?}",
                            seg.start_ms, trimmed
                        );
                    } else {
                        let segment = MeetingSegment {
                            id: 0,
                            meeting_id,
                            speaker_label: format!("Speaker {}", seg.speaker_id),
                            start_ms: seg.start_ms,
                            end_ms: seg.end_ms,
                            text: final_text,
                            confidence: None,
                            audio_source: source.as_str().to_string(),
                        };
                        if let Err(e) = self.insert_segment(&segment) {
                            error!("Failed to insert diarized segment: {}", e);
                        } else {
                            let _ = self.app_handle.emit("meeting-segment-added", &segment);
                        }
                    }
                }
                Ok(text) => {
                    consecutive_timeouts = 0;
                    debug!(
                        "Skipped diarized segment at {}ms (empty or hallucination): {:?}",
                        seg.start_ms,
                        text.trim()
                    );
                }
                Err(e) => {
                    error!(
                        "Failed to transcribe diarized segment at {}ms: {}",
                        seg.start_ms, e
                    );
                    if matches!(e, TranscribeError::TimedOut) {
                        consecutive_timeouts += 1;
                        if consecutive_timeouts >= MAX_CONSECUTIVE_DECODE_TIMEOUTS {
                            error!(
                                "Abandoning diarized transcription after {consecutive_timeouts} \
                                 consecutive decode timeouts"
                            );
                            break;
                        }
                    }
                }
            }
            emit_progress(idx + 1, chunks_total, BatchPhase::Transcribing);
        }

        emit_progress(chunks_total, chunks_total, BatchPhase::Done);

        info!(
            "Diarized transcription complete: {} segments from {} merged speaker segments",
            merged.len(),
            raw_segments.len()
        );
    }

    fn insert_segment(&self, segment: &MeetingSegment) -> Result<()> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO meeting_segments (meeting_id, speaker_label, start_ms, end_ms, text, confidence, audio_source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                segment.meeting_id,
                segment.speaker_label,
                segment.start_ms,
                segment.end_ms,
                segment.text,
                segment.confidence,
                segment.audio_source,
            ],
        )?;
        Ok(())
    }

    pub fn get_meeting_status(&self) -> MeetingStatus {
        // try_lock avoids blocking; locked = recording in progress.
        match self.state.try_lock() {
            Ok(state) => match &*state {
                ManagerState::Idle => MeetingStatus::Complete,
                ManagerState::Recording(_) => MeetingStatus::Recording,
                ManagerState::Processing => MeetingStatus::Processing,
            },
            Err(_) => MeetingStatus::Recording,
        }
    }

    pub fn get_meeting(&self, id: i64) -> Result<Meeting> {
        let conn = self.get_connection()?;
        conn.query_row(
            "SELECT id, title, start_time, end_time, duration_ms, mic_file_name, system_file_name, summary, status FROM meetings WHERE id = ?1",
            params![id],
            |row| {
                let status_str: String = row.get(8)?;
                Ok(Meeting {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    start_time: row.get(2)?,
                    end_time: row.get(3)?,
                    duration_ms: row.get(4)?,
                    mic_file_name: row.get(5)?,
                    system_file_name: row.get(6)?,
                    summary: row.get(7)?,
                    status: MeetingStatus::from_str(&status_str),
                })
            },
        )
        .context("Meeting not found")
    }

    pub fn get_meeting_segments(&self, meeting_id: i64) -> Result<Vec<MeetingSegment>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, meeting_id, speaker_label, start_ms, end_ms, text, confidence, audio_source FROM meeting_segments WHERE meeting_id = ?1 ORDER BY start_ms ASC",
        )?;
        let segments = stmt
            .query_map(params![meeting_id], |row| {
                Ok(MeetingSegment {
                    id: row.get(0)?,
                    meeting_id: row.get(1)?,
                    speaker_label: row.get(2)?,
                    start_ms: row.get(3)?,
                    end_ms: row.get(4)?,
                    text: row.get(5)?,
                    confidence: row.get(6)?,
                    audio_source: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()
            .context("Failed to query meeting segments")?;
        Ok(segments)
    }

    pub fn list_meetings(&self) -> Result<Vec<Meeting>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, start_time, end_time, duration_ms, mic_file_name, system_file_name, summary, status FROM meetings ORDER BY start_time DESC",
        )?;
        let meetings = stmt
            .query_map([], |row| {
                let status_str: String = row.get(8)?;
                Ok(Meeting {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    start_time: row.get(2)?,
                    end_time: row.get(3)?,
                    duration_ms: row.get(4)?,
                    mic_file_name: row.get(5)?,
                    system_file_name: row.get(6)?,
                    summary: row.get(7)?,
                    status: MeetingStatus::from_str(&status_str),
                })
            })?
            .collect::<Result<Vec<_>, _>>()
            .context("Failed to query meetings")?;
        Ok(meetings)
    }

    pub fn delete_meeting(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;
        let meeting = self.get_meeting(id)?;

        if let Some(ref name) = meeting.mic_file_name {
            let path = self.meetings_dir.join(name);
            if path.exists() {
                let _ = fs::remove_file(&path);
            }
        }
        if let Some(ref name) = meeting.system_file_name {
            let path = self.meetings_dir.join(name);
            if path.exists() {
                let _ = fs::remove_file(&path);
            }
        }

        // CASCADE handles meeting_segments.
        conn.execute("DELETE FROM meetings WHERE id = ?1", params![id])?;
        info!("Deleted meeting {}", id);
        Ok(())
    }

    pub fn rename_speaker(&self, meeting_id: i64, old_label: &str, new_label: &str) -> Result<()> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE meeting_segments SET speaker_label = ?1 WHERE meeting_id = ?2 AND speaker_label = ?3",
            params![new_label, meeting_id, old_label],
        )?;
        info!(
            "Renamed speaker '{}' to '{}' in meeting {}",
            old_label, new_label, meeting_id
        );
        Ok(())
    }

    pub fn get_transcript_for_summary(&self, meeting_id: i64) -> Result<String> {
        let segments = self.get_meeting_segments(meeting_id)?;
        if segments.is_empty() {
            anyhow::bail!("No segments to summarize");
        }

        let transcript = segments
            .iter()
            .map(|s| {
                let time = format_ms_to_hms(s.start_ms);
                format!("[{}] {}: {}", time, s.speaker_label, s.text)
            })
            .collect::<Vec<_>>()
            .join("\n");

        Ok(transcript)
    }

    pub fn save_summary(&self, app: &AppHandle, meeting_id: i64, summary: &str) -> Result<()> {
        let conn = self.get_connection()?;
        conn.execute(
            "UPDATE meetings SET summary = ?1 WHERE id = ?2",
            params![summary, meeting_id],
        )?;
        let _ = app.emit("meeting-summary-generated", meeting_id);
        info!("Saved summary for meeting {}", meeting_id);
        Ok(())
    }

    fn emit_status_changed(&self, status: MeetingStatus) {
        let _ = self.app_handle.emit("meeting-status-changed", &status);
    }

    /// Deletes existing segments + re-runs pipeline.
    pub async fn retranscribe_meeting(&self, meeting_id: i64) -> Result<()> {
        let audio_path = self
            .get_mic_audio_path(meeting_id)?
            .ok_or_else(|| anyhow::anyhow!("No audio file found for meeting {}", meeting_id))?;

        {
            let conn = self.get_connection()?;
            conn.execute(
                "UPDATE meetings SET status = ?1 WHERE id = ?2",
                params![MeetingStatus::Processing.as_str(), meeting_id],
            )?;
        }
        self.emit_status_changed(MeetingStatus::Processing);

        let audio = PathBuf::from(&audio_path);
        let total_samples = wav_sample_count(&audio)
            .with_context(|| format!("Failed to load audio: {}", audio_path))?;

        if total_samples == 0 {
            anyhow::bail!("Audio file is empty for meeting {}", meeting_id);
        }

        {
            let conn = self.get_connection()?;
            conn.execute(
                "DELETE FROM meeting_segments WHERE meeting_id = ?1",
                params![meeting_id],
            )?;
        }

        let diarization_available = self
            .app_handle
            .try_state::<Arc<DiarizationManager>>()
            .map(|dm| dm.is_available())
            .unwrap_or(false);

        if !diarization_available {
            // Don't silently fall back.
            let conn = self.get_connection()?;
            conn.execute(
                "UPDATE meetings SET status = ?1 WHERE id = ?2",
                params![MeetingStatus::Complete.as_str(), meeting_id],
            )?;
            self.emit_status_changed(MeetingStatus::Complete);
            anyhow::bail!(
                "Speaker detection model is not downloaded yet. Please wait for the download to finish."
            );
        }

        self.diarize_and_transcribe(meeting_id, &audio, total_samples, AudioSource::Mic)
            .await;

        {
            let conn = self.get_connection()?;
            conn.execute(
                "UPDATE meetings SET status = ?1 WHERE id = ?2",
                params![MeetingStatus::Complete.as_str(), meeting_id],
            )?;
        }
        self.emit_status_changed(MeetingStatus::Complete);

        info!("Meeting {} retranscription complete", meeting_id);
        Ok(())
    }

    pub fn get_mic_audio_path(&self, meeting_id: i64) -> Result<Option<String>> {
        let meeting = self.get_meeting(meeting_id)?;
        match meeting.mic_file_name {
            Some(ref name) => {
                let path = self.meetings_dir.join(name);
                if path.exists() {
                    Ok(Some(
                        path.to_str().context("Invalid path encoding")?.to_string(),
                    ))
                } else {
                    Ok(None)
                }
            }
            None => Ok(None),
        }
    }
}

/// Walk plan: `chunk_size` per decode, `step` advance, 5s overlap between chunks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChunkPlan {
    pub chunk_size: usize,
    pub step: usize,
    pub chunks_total: usize,
}

/// Meetings run for hours with no VAD to compress them: keeping a stream in memory would grow
/// 230 MB an hour per source. Chunks land in the meeting's WAV as they arrive instead.
struct MeetingAudioSink {
    writer: WavSink,
    file_name: String,
    samples_written: usize,
}

impl MeetingAudioSink {
    fn create(dir: &Path, file_name: String) -> Result<Self> {
        let writer = create_wav_file(dir.join(&file_name))?;
        Ok(Self {
            writer,
            file_name,
            samples_written: 0,
        })
    }

    fn write(&mut self, chunk: &[f32]) -> Result<()> {
        write_wav_samples(&mut self.writer, chunk)?;
        self.samples_written += chunk.len();
        Ok(())
    }

    /// `None` when nothing was captured — the empty file is removed rather than recorded.
    fn finish(self, dir: &Path) -> Option<String> {
        if let Err(e) = self.writer.finalize() {
            warn!("Failed to finalize system audio file: {e:#}");
        }
        if self.samples_written == 0 {
            let _ = std::fs::remove_file(dir.join(&self.file_name));
            return None;
        }
        info!(
            "Meeting system audio captured {} samples ({:.1}s)",
            self.samples_written,
            self.samples_written as f32 / 16_000.0
        );
        Some(self.file_name)
    }
}

/// A stream that can no longer be written is closed, not retried: the meeting keeps recording
/// whatever else works instead of failing on every chunk for the rest of the session.
fn write_to_sink(sink: &std::sync::Mutex<Option<MeetingAudioSink>>, source: &str, chunk: &[f32]) {
    let Ok(mut guard) = sink.lock() else {
        return;
    };
    let Some(open) = guard.as_mut() else {
        return;
    };
    if let Err(e) = open.write(chunk) {
        error!("{source} audio write failed, dropping the rest of the stream: {e:#}");
        *guard = None;
    }
}

fn wav_sample_count(path: &Path) -> Result<usize> {
    Ok(WavWindows::open(path, 1)?.total_samples())
}

pub fn chunk_plan(samples_len: usize, chunk_secs: usize) -> ChunkPlan {
    const SAMPLE_RATE: usize = 16_000;
    const OVERLAP_SAMPLES: usize = 5 * SAMPLE_RATE;
    let chunk_size = chunk_secs.max(1) * SAMPLE_RATE;
    let step = chunk_size.saturating_sub(OVERLAP_SAMPLES).max(1);
    let chunks_total = if samples_len == 0 {
        0
    } else if samples_len <= chunk_size {
        1
    } else {
        let remaining = samples_len.saturating_sub(chunk_size);
        1 + remaining.div_ceil(step)
    };
    ChunkPlan {
        chunk_size,
        step,
        chunks_total,
    }
}

pub fn format_ms_to_hms(ms: i64) -> String {
    let total_secs = ms / 1000;
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

pub fn format_ms_to_srt_time(ms: i64) -> String {
    let total_secs = ms / 1000;
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    let millis = ms % 1000;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, millis)
}

pub fn format_ms_to_vtt_time(ms: i64) -> String {
    let total_secs = ms / 1000;
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    let millis = ms % 1000;
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, millis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn sink_writes_what_it_is_fed_and_drops_an_empty_capture() {
        let dir = TempDir::new().unwrap();
        let mut sink = MeetingAudioSink::create(dir.path(), "written.wav".into()).unwrap();
        sink.write(&[0.5, -0.5]).unwrap();
        sink.write(&[0.25]).unwrap();
        assert_eq!(sink.finish(dir.path()).as_deref(), Some("written.wav"));

        let samples =
            crate::audio_toolkit::audio::load_wav_file(dir.path().join("written.wav")).unwrap();
        assert_eq!(samples.len(), 3);
        assert!((samples[0] - 0.5).abs() < 0.001);

        let empty = MeetingAudioSink::create(dir.path(), "empty.wav".into()).unwrap();
        assert_eq!(empty.finish(dir.path()), None);
        assert!(!dir.path().join("empty.wav").exists());
    }

    fn make_test_db() -> (TempDir, PathBuf) {
        let temp = TempDir::new().unwrap();
        let db_path = temp.path().join("test.db");
        database::initialize_database(&db_path).unwrap();
        (temp, db_path)
    }

    fn open_conn(db_path: &PathBuf) -> Connection {
        let conn = Connection::open(db_path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn
    }

    fn insert_meeting(conn: &Connection, title: &str, status: &str) -> i64 {
        conn.execute(
            "INSERT INTO meetings (title, start_time, status) VALUES (?1, ?2, ?3)",
            params![title, 1700000000_i64, status],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_segment(
        conn: &Connection,
        meeting_id: i64,
        speaker: &str,
        start_ms: i64,
        end_ms: i64,
        text: &str,
        source: &str,
    ) -> i64 {
        conn.execute(
            "INSERT INTO meeting_segments (meeting_id, speaker_label, start_ms, end_ms, text, confidence, audio_source) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)",
            params![meeting_id, speaker, start_ms, end_ms, text, source],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn format_ms_to_hms_zero() {
        assert_eq!(format_ms_to_hms(0), "00:00:00");
    }

    #[test]
    fn format_ms_to_hms_seconds_only() {
        assert_eq!(format_ms_to_hms(5_000), "00:00:05");
    }

    #[test]
    fn format_ms_to_hms_minutes_and_seconds() {
        assert_eq!(format_ms_to_hms(125_000), "00:02:05");
    }

    #[test]
    fn format_ms_to_hms_hours() {
        assert_eq!(format_ms_to_hms(3_661_000), "01:01:01");
    }

    #[test]
    fn format_ms_to_hms_sub_second_truncated() {
        assert_eq!(format_ms_to_hms(1_500), "00:00:01");
    }

    #[test]
    fn format_ms_to_srt_time_zero() {
        assert_eq!(format_ms_to_srt_time(0), "00:00:00,000");
    }

    #[test]
    fn format_ms_to_srt_time_with_millis() {
        assert_eq!(format_ms_to_srt_time(3_661_456), "01:01:01,456");
    }

    #[test]
    fn format_ms_to_srt_time_comma_separator() {
        let result = format_ms_to_srt_time(1_234);
        assert!(result.contains(','), "SRT times must use comma separator");
    }

    #[test]
    fn format_ms_to_vtt_time_zero() {
        assert_eq!(format_ms_to_vtt_time(0), "00:00:00.000");
    }

    #[test]
    fn format_ms_to_vtt_time_with_millis() {
        assert_eq!(format_ms_to_vtt_time(3_661_456), "01:01:01.456");
    }

    #[test]
    fn format_ms_to_vtt_time_dot_separator() {
        let result = format_ms_to_vtt_time(1_234);
        assert!(result.contains('.'), "VTT times must use dot separator");
        assert!(!result.contains(','), "VTT must not use comma separator");
    }

    #[test]
    fn chunk_plan_empty_buffer_yields_no_chunks() {
        let p = chunk_plan(0, 30);
        assert_eq!(p.chunks_total, 0);
    }

    #[test]
    fn chunk_plan_buffer_shorter_than_chunk_yields_one() {
        let p = chunk_plan(10 * 16_000, 30);
        assert_eq!(p.chunks_total, 1);
    }

    #[test]
    fn chunk_plan_buffer_equal_to_chunk_yields_one() {
        // Old formula `(sample_len + step - 1) / step` returned 2 here.
        let p = chunk_plan(30 * 16_000, 30);
        assert_eq!(p.chunks_total, 1);
    }

    #[test]
    fn chunk_plan_typical_meeting_chunk_count() {
        // 5min meeting, 30s chunks, 5s overlap = 12 chunks.
        let p = chunk_plan(5 * 60 * 16_000, 30);
        assert_eq!(p.chunks_total, 12);
        assert_eq!(p.chunk_size, 30 * 16_000);
        assert_eq!(p.step, 25 * 16_000);
    }

    #[test]
    fn chunk_plan_clamps_chunk_secs_to_at_least_one() {
        let p = chunk_plan(0, 0);
        assert!(
            p.chunk_size >= 16_000,
            "chunk_size must be at least 1 second of audio"
        );
    }

    #[test]
    fn chunk_plan_step_never_zero() {
        // Else loop won't terminate.
        let p = chunk_plan(100_000, 3);
        assert!(p.step >= 1);
    }

    #[test]
    fn chunk_plan_count_matches_simulated_loop() {
        // Exhaustive vs transcribe_samples advance loop.
        for secs in [1_usize, 7, 15, 30, 65, 137, 300] {
            for chunk_secs in [10_usize, 30, 60] {
                let samples_len = secs * 16_000;
                let plan = chunk_plan(samples_len, chunk_secs);
                let mut pos = 0usize;
                let mut count = 0usize;
                while pos < samples_len {
                    let end = (pos + plan.chunk_size).min(samples_len);
                    count += 1;
                    let advance = if end < samples_len {
                        plan.step
                    } else {
                        end - pos
                    };
                    pos += advance;
                }
                assert_eq!(
                    plan.chunks_total, count,
                    "mismatch for secs={secs} chunk_secs={chunk_secs}",
                );
            }
        }
    }

    #[test]
    fn meeting_status_round_trip() {
        let statuses = [
            MeetingStatus::Recording,
            MeetingStatus::Processing,
            MeetingStatus::Complete,
            MeetingStatus::Error,
        ];
        for status in &statuses {
            let s = status.as_str();
            let recovered = MeetingStatus::from_str(s);
            assert_eq!(*status, recovered);
        }
    }

    #[test]
    fn meeting_status_unknown_maps_to_error() {
        assert_eq!(MeetingStatus::from_str("unknown"), MeetingStatus::Error);
        assert_eq!(MeetingStatus::from_str(""), MeetingStatus::Error);
    }

    #[test]
    fn meeting_status_serialization() {
        let json = serde_json::to_string(&MeetingStatus::Recording).unwrap();
        assert_eq!(json, "\"recording\"");

        let deserialized: MeetingStatus = serde_json::from_str("\"complete\"").unwrap();
        assert_eq!(deserialized, MeetingStatus::Complete);
    }

    #[test]
    fn audio_source_as_str() {
        assert_eq!(AudioSource::Mic.as_str(), "mic");
        assert_eq!(AudioSource::System.as_str(), "system");
    }

    #[test]
    fn export_format_serialization() {
        let json = serde_json::to_string(&ExportFormat::Srt).unwrap();
        assert_eq!(json, "\"srt\"");

        let md: ExportFormat = serde_json::from_str("\"markdown\"").unwrap();
        assert!(matches!(md, ExportFormat::Markdown));
    }

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            params![name],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
            > 0
    }

    #[test]
    fn meeting_tables_created_at_init() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        assert!(table_exists(&conn, "meetings"));
        assert!(table_exists(&conn, "meeting_segments"));
    }

    #[test]
    fn insert_and_query_meeting() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let id = insert_meeting(&conn, "Test Meeting", "recording");

        let title: String = conn
            .query_row(
                "SELECT title FROM meetings WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(title, "Test Meeting");
    }

    #[test]
    fn insert_and_query_segments() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let meeting_id = insert_meeting(&conn, "Seg Test", "complete");
        insert_segment(&conn, meeting_id, "Alice", 0, 5000, "Hello there", "mic");
        insert_segment(&conn, meeting_id, "Bob", 5000, 10000, "Hi Alice", "system");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1",
                params![meeting_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn segments_ordered_by_start_ms() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Order Test", "complete");
        insert_segment(&conn, mid, "B", 5000, 10000, "Second", "mic");
        insert_segment(&conn, mid, "A", 0, 5000, "First", "mic");

        let mut stmt = conn
            .prepare(
                "SELECT text FROM meeting_segments WHERE meeting_id = ?1 ORDER BY start_ms ASC",
            )
            .unwrap();
        let texts: Vec<String> = stmt
            .query_map(params![mid], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(texts, vec!["First", "Second"]);
    }

    #[test]
    fn cascade_delete_removes_segments() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Cascade Test", "complete");
        insert_segment(&conn, mid, "X", 0, 1000, "Will be deleted", "mic");

        conn.execute("DELETE FROM meetings WHERE id = ?1", params![mid])
            .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1",
                params![mid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 0,
            "Segments must be cascade-deleted with parent meeting"
        );
    }

    #[test]
    fn rename_speaker_updates_all_matching_segments() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Rename Test", "complete");
        insert_segment(&conn, mid, "Speaker 1", 0, 5000, "Hello", "mic");
        insert_segment(&conn, mid, "Speaker 1", 5000, 10000, "World", "mic");
        insert_segment(&conn, mid, "Speaker 2", 10000, 15000, "Other", "system");

        conn.execute(
            "UPDATE meeting_segments SET speaker_label = ?1 WHERE meeting_id = ?2 AND speaker_label = ?3",
            params!["Alice", mid, "Speaker 1"],
        )
        .unwrap();

        let alice_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1 AND speaker_label = 'Alice'",
                params![mid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(alice_count, 2);

        let sp2_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1 AND speaker_label = 'Speaker 2'",
                params![mid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(sp2_count, 1);
    }

    #[test]
    fn list_meetings_ordered_by_start_time_desc() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        conn.execute(
            "INSERT INTO meetings (title, start_time, status) VALUES (?1, ?2, ?3)",
            params!["Old Meeting", 1000_i64, "complete"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO meetings (title, start_time, status) VALUES (?1, ?2, ?3)",
            params!["New Meeting", 2000_i64, "complete"],
        )
        .unwrap();

        let mut stmt = conn
            .prepare("SELECT title FROM meetings ORDER BY start_time DESC")
            .unwrap();
        let titles: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(titles, vec!["New Meeting", "Old Meeting"]);
    }

    #[test]
    fn update_meeting_fields() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Update Test", "recording");

        conn.execute(
            "UPDATE meetings SET end_time = ?1, duration_ms = ?2, mic_file_name = ?3, status = ?4 WHERE id = ?5",
            params![1700001000_i64, 60000_i64, "meeting-1-mic.wav", "complete", mid],
        )
        .unwrap();

        let (end_time, duration, mic_file, status): (i64, i64, String, String) = conn
            .query_row(
                "SELECT end_time, duration_ms, mic_file_name, status FROM meetings WHERE id = ?1",
                params![mid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();

        assert_eq!(end_time, 1700001000);
        assert_eq!(duration, 60000);
        assert_eq!(mic_file, "meeting-1-mic.wav");
        assert_eq!(status, "complete");
    }

    #[test]
    fn meeting_summary_update() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Summary Test", "complete");

        conn.execute(
            "UPDATE meetings SET summary = ?1 WHERE id = ?2",
            params!["This is a summary", mid],
        )
        .unwrap();

        let summary: String = conn
            .query_row(
                "SELECT summary FROM meetings WHERE id = ?1",
                params![mid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(summary, "This is a summary");
    }

    #[test]
    fn foreign_key_constraint_enforced() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let result = conn.execute(
            "INSERT INTO meeting_segments (meeting_id, speaker_label, start_ms, end_ms, text, audio_source) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![9999_i64, "X", 0_i64, 1000_i64, "orphan", "mic"],
        );

        assert!(
            result.is_err(),
            "Foreign key constraint should prevent orphan segments"
        );
    }

    #[test]
    fn meeting_struct_serialization_round_trip() {
        let meeting = Meeting {
            id: 1,
            title: "Test Meeting".to_string(),
            start_time: 1700000000,
            end_time: Some(1700001000),
            duration_ms: Some(60000),
            mic_file_name: Some("mic.wav".to_string()),
            system_file_name: None,
            summary: Some("A good meeting".to_string()),
            status: MeetingStatus::Complete,
        };

        let json = serde_json::to_string(&meeting).unwrap();
        let deserialized: Meeting = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, 1);
        assert_eq!(deserialized.title, "Test Meeting");
        assert_eq!(deserialized.status, MeetingStatus::Complete);
        assert_eq!(deserialized.summary, Some("A good meeting".to_string()));
    }

    #[test]
    fn meeting_segment_serialization_round_trip() {
        let seg = MeetingSegment {
            id: 1,
            meeting_id: 1,
            speaker_label: "Alice".to_string(),
            start_ms: 0,
            end_ms: 5000,
            text: "Hello world".to_string(),
            confidence: Some(0.95),
            audio_source: "mic".to_string(),
        };

        let json = serde_json::to_string(&seg).unwrap();
        let deserialized: MeetingSegment = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.speaker_label, "Alice");
        assert_eq!(deserialized.text, "Hello world");
        assert_eq!(deserialized.confidence, Some(0.95));
    }
}
