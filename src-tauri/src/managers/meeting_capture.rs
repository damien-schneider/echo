//! Opening the microphone and system-audio streams of a running meeting, and feeding them on.

use anyhow::Result;
use log::{error, info, warn};
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use super::meeting::MeetingManager;
use super::meeting_audio_sink::{write_to_sink, MeetingAudioSink};
use super::meeting_streaming::{StreamingSource, StreamingWorker};
use super::meeting_types::{AudioSource, AudioWarningReason, MeetingAudioWarning};
use crate::audio_toolkit::audio::system_capture::create_system_capture;
use crate::audio_toolkit::AudioRecorder;

pub(super) struct MicCapture {
    pub(super) meeting_id: i64,
    pub(super) recorder: AudioRecorder,
    pub(super) streaming_worker: Option<Arc<StreamingWorker>>,
}

pub(super) struct SystemCapture {
    pub(super) meeting_id: i64,
    pub(super) streaming_worker: Option<Arc<StreamingWorker>>,
    pub(super) capture_epoch: Instant,
}

impl MeetingManager {
    /// Returns the instant the microphone stream opened — time zero for both timelines.
    pub(super) fn start_mic_capture(&self, capture: MicCapture) -> Result<Instant> {
        let MicCapture {
            meeting_id,
            recorder,
            streaming_worker,
        } = capture;
        let (mic_tx, mic_rx) =
            std::sync::mpsc::channel::<crate::audio_toolkit::CapturedAudioFrame>();
        let mic_file_name = format!("meeting-{meeting_id}-mic.wav");
        *self.mic_sink.lock().unwrap() = Some(
            MeetingAudioSink::create(&self.meetings_dir, mic_file_name.clone())
                .inspect_err(|_| self.abort_start(meeting_id))?,
        );
        self.record_file_name(meeting_id, "mic_file_name", &mic_file_name);

        let sink = self.mic_sink.clone();
        let warn_handle = self.app_handle.clone();
        let handle = std::thread::Builder::new()
            .name(format!("meeting-mic-collector-{meeting_id}"))
            .spawn(move || {
                while let Ok(frame) = mic_rx.recv() {
                    if write_to_sink(&sink, &frame.samples) {
                        emit_write_failure(&warn_handle, AudioSource::Mic);
                    }
                    if let Some(ref worker) = streaming_worker {
                        worker.push_audio(StreamingSource::Mic, frame.samples);
                    }
                }
            })
            .map_err(|e| {
                self.abort_start(meeting_id);
                anyhow::anyhow!("spawn mic collector: {e}")
            })?;
        *self.mic_collector.lock().unwrap() = Some(handle);

        let capture_epoch = Instant::now();
        recorder.start_streaming(mic_tx).map_err(|e| {
            self.abort_start(meeting_id);
            anyhow::anyhow!("Failed to start microphone recording: {e}")
        })?;
        *self.mic_recorder.lock().unwrap() = Some(recorder);

        info!("Meeting microphone stream started");
        Ok(capture_epoch)
    }

    /// A machine that cannot share its output still records the microphone.
    pub(super) fn start_system_capture(&self, capture: SystemCapture) -> Result<()> {
        let SystemCapture {
            meeting_id,
            streaming_worker,
            capture_epoch,
        } = capture;
        let mut system_capture = match create_system_capture() {
            Ok(capture) => capture,
            Err(e) => {
                warn!("Failed to construct system audio capture: {e:#}");
                return Ok(());
            }
        };
        let chunks = match system_capture.start() {
            Ok(chunks) => chunks,
            Err(e) => {
                warn!("Failed to start system audio capture: {e:#}");
                return Ok(());
            }
        };

        let system_file_name = format!("meeting-{meeting_id}-system.wav");
        let sink = MeetingAudioSink::create(&self.meetings_dir, system_file_name.clone())
            .inspect_err(|_| {
                let _ = system_capture.stop();
                self.abort_start(meeting_id);
            })?;
        *self.system_sink.lock().unwrap() = Some(sink);
        self.record_file_name(meeting_id, "system_file_name", &system_file_name);

        let sink = self.system_sink.clone();
        let db_path = self.db_path.clone();
        let warn_handle = self.app_handle.clone();
        let stopping = self.stopping.clone();
        let handle = std::thread::Builder::new()
            .name(format!("meeting-system-collector-{meeting_id}"))
            .spawn(move || {
                let mut offset_written = false;
                while let Ok(chunk) = chunks.recv() {
                    if !offset_written {
                        offset_written = true;
                        write_system_offset(
                            &db_path,
                            meeting_id,
                            capture_epoch.elapsed().as_millis() as i64,
                        );
                    }
                    if write_to_sink(&sink, &chunk) {
                        emit_write_failure(&warn_handle, AudioSource::System);
                    }
                    if let Some(ref worker) = streaming_worker {
                        worker.push_audio(StreamingSource::System, chunk);
                    }
                }
                // The channel also closes on a normal stop; that teardown is not a warning.
                if !stopping.load(std::sync::atomic::Ordering::Relaxed) {
                    emit_audio_warning(
                        &warn_handle,
                        AudioSource::System,
                        AudioWarningReason::Device,
                    );
                }
            })
            .map_err(|e| {
                let _ = system_capture.stop();
                self.abort_start(meeting_id);
                anyhow::anyhow!("spawn system capture collector: {e}")
            })?;
        *self.system_capture.lock().unwrap() = Some(system_capture);
        *self.system_collector.lock().unwrap() = Some(handle);

        info!("Meeting system audio stream started");
        Ok(())
    }
}

/// The stall watchdog and a dead capture stream both mean the same thing to the user: this source
/// stopped recording while the meeting is still running.
pub(super) fn emit_audio_warning(app: &AppHandle, source: AudioSource, reason: AudioWarningReason) {
    warn!("Meeting {} audio stopped: {reason:?}", source.as_str());
    let _ = app.emit(
        "meeting-audio-warning",
        MeetingAudioWarning { source, reason },
    );
}

/// A full disk is silent otherwise: the capture keeps delivering, the meeting keeps running, and
/// nothing of it is saved from here on.
fn emit_write_failure(app: &AppHandle, source: AudioSource) {
    emit_audio_warning(app, source, AudioWarningReason::Write);
}

/// System capture opens after the microphone; without its lag both timelines claim to start at
/// zero and the system transcript drifts ahead of what was actually said.
fn write_system_offset(db_path: &Path, meeting_id: i64, offset_ms: i64) {
    let written = Connection::open(db_path).and_then(|conn| {
        conn.execute(
            "UPDATE meetings SET system_offset_ms = ?1 WHERE id = ?2",
            params![offset_ms, meeting_id],
        )
    });
    match written {
        Ok(_) => info!("Meeting {meeting_id} system audio started {offset_ms}ms after the mic"),
        Err(e) => error!("Failed to record the system audio offset: {e}"),
    }
}
