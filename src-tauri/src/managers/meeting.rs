//! Dual-stream meeting recording (mic + system), chunked transcription, diarization, lifecycle.

use anyhow::{Context, Result};
use log::{debug, error, info};
use rusqlite::{params, Connection};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

use super::database;
use super::meeting_audio_sink::MeetingAudioSink;
use super::meeting_batch_plan::BatchFiles;
use super::meeting_recovery;
use super::meeting_streaming::{StreamingWorker, StreamingWorkerHandle};
pub use super::meeting_types::*;
use crate::audio_toolkit::audio::system_capture::SystemAudioCapture;
use crate::audio_toolkit::{list_input_devices, AudioRecorder};
use crate::helpers::clamshell;
use crate::settings;

pub(super) struct RecordingState {
    pub(super) meeting_id: i64,
    pub(super) start_time: i64,
}

pub(super) enum ManagerState {
    Idle,
    Recording(RecordingState),
    Processing,
}

pub struct MeetingManager {
    pub(super) app_handle: AppHandle,
    state: Arc<Mutex<ManagerState>>,
    pub(super) meetings_dir: PathBuf,
    pub(super) db_path: PathBuf,
    /// No VAD — captures everything.
    pub(super) mic_recorder: Arc<std::sync::Mutex<Option<AudioRecorder>>>,
    pub(super) system_capture: Arc<std::sync::Mutex<Option<Box<dyn SystemAudioCapture>>>>,
    pub(super) mic_sink: Arc<std::sync::Mutex<Option<MeetingAudioSink>>>,
    pub(super) mic_collector: Arc<std::sync::Mutex<Option<std::thread::JoinHandle<()>>>>,
    pub(super) system_sink: Arc<std::sync::Mutex<Option<MeetingAudioSink>>>,
    pub(super) system_collector: Arc<std::sync::Mutex<Option<std::thread::JoinHandle<()>>>>,
    pub(super) streaming_worker: Arc<std::sync::Mutex<Option<Arc<StreamingWorker>>>>,
    /// Owned separately so we can join even when forwarders still hold Arc clones.
    pub(super) streaming_handle: Arc<std::sync::Mutex<Option<StreamingWorkerHandle>>>,
    /// A capture channel also closes on a normal stop; only an unasked-for close is a warning.
    pub(super) stopping: Arc<std::sync::atomic::AtomicBool>,
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

        meeting_recovery::sweep(app_handle, &db_path, &meetings_dir);

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
            stopping: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
    }

    pub(super) fn get_connection(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)
            .with_context(|| format!("Failed to open database at {:?}", self.db_path))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .context("Failed to enable foreign keys")?;
        Ok(conn)
    }

    /// Resolves from settings; honours clamshell mode.
    pub(super) fn get_effective_mic_device(&self) -> Option<cpal::Device> {
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
    /// otherwise keeps the microphone, the system capture and the streaming worker alive for good,
    /// and leaves an empty row the user can only see as a broken meeting.
    pub(super) fn abort_start(&self, meeting_id: i64) {
        self.stopping
            .store(true, std::sync::atomic::Ordering::Relaxed);
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
        if let Err(e) = self.get_connection().and_then(|conn| {
            Ok(conn.execute("DELETE FROM meetings WHERE id = ?1", params![meeting_id])?)
        }) {
            error!("Failed to discard the half-started meeting {meeting_id}: {e:#}");
        }
    }

    /// Written before a single sample lands, so a crash still leaves the recording reachable.
    pub(super) fn record_file_name(&self, meeting_id: i64, column: &str, file_name: &str) {
        let updated = self.get_connection().and_then(|conn| {
            Ok(conn.execute(
                &format!("UPDATE meetings SET {column} = ?1 WHERE id = ?2"),
                params![file_name, meeting_id],
            )?)
        });
        if let Err(e) = updated {
            error!("Failed to record {column} for meeting {meeting_id}: {e:#}");
        }
    }

    pub(super) fn lock_state(&self) -> std::sync::MutexGuard<'_, ManagerState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(super) fn read_system_offset_ms(&self, meeting_id: i64) -> i64 {
        self.get_connection()
            .and_then(|conn| {
                conn.query_row(
                    "SELECT system_offset_ms FROM meetings WHERE id = ?1",
                    params![meeting_id],
                    |row| row.get(0),
                )
                .map_err(Into::into)
            })
            .unwrap_or(0)
    }

    pub fn get_active_meeting(&self) -> Option<ActiveMeeting> {
        match &*self.lock_state() {
            ManagerState::Idle => None,
            ManagerState::Recording(recording) => Some(ActiveMeeting::Recording {
                meeting_id: recording.meeting_id,
                start_time: recording.start_time,
            }),
            ManagerState::Processing => Some(ActiveMeeting::Processing),
        }
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

    pub(super) fn emit_status_changed(&self, status: MeetingStatus) {
        let _ = self.app_handle.emit("meeting-status-changed", &status);
    }

    /// Pushed at every transition: a window drawing the meeting must never have to ask, and the
    /// notch has no page to open before it can show the timer.
    pub(super) fn emit_active_meeting(&self, active: Option<ActiveMeeting>) {
        let _ = self.app_handle.emit("meeting-active", &active);
    }

    /// Rebuilds every stream from the recordings on disk — the same pass a live meeting ends with.
    pub async fn retranscribe_meeting(&self, meeting_id: i64) -> Result<()> {
        if !matches!(*self.lock_state(), ManagerState::Idle) {
            anyhow::bail!("Finish the meeting in progress before retranscribing another one");
        }

        self.models_ready()?;

        let meeting = self.get_meeting(meeting_id)?;
        let files = BatchFiles {
            mic: self.existing_recording(meeting.mic_file_name),
            system: self.existing_recording(meeting.system_file_name),
            system_offset_ms: self.read_system_offset_ms(meeting_id),
        };
        if files.mic.is_none() && files.system.is_none() {
            anyhow::bail!("No audio file found for meeting {meeting_id}");
        }

        self.set_meeting_status(meeting_id, &MeetingStatus::Processing);
        self.emit_status_changed(MeetingStatus::Processing);

        self.get_connection()?.execute(
            "DELETE FROM meeting_segments WHERE meeting_id = ?1",
            params![meeting_id],
        )?;

        let status = self.run_batch_transcription(meeting_id, files).await;
        self.emit_status_changed(status.clone());
        info!("Meeting {meeting_id} retranscribed as {}", status.as_str());
        Ok(())
    }

    fn existing_recording(&self, file_name: Option<String>) -> Option<String> {
        file_name.filter(|name| self.meetings_dir.join(name).exists())
    }
}

#[cfg(test)]
include!("meeting_tests.rs");
