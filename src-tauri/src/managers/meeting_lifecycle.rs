//! Start to stop: the two captures come up together, come down together, and hand the recording
//! to the batch pass exactly once.

use anyhow::Result;
use chrono::Utc;
use log::{error, info, warn};
use rusqlite::params;
use std::sync::Arc;
use tauri::Emitter;

use super::meeting::{
    ActiveMeeting, AudioSource, ManagerState, MeetingManager, MeetingStatus, RecordingState,
};
use super::meeting_batch_plan::BatchFiles;
use super::meeting_capture::{emit_audio_warning, MicCapture, SystemCapture};
use super::meeting_types::AudioWarningReason;
use crate::audio_toolkit::audio::system_capture::is_system_audio_available;
use crate::audio_toolkit::AudioRecorder;
use crate::settings;

impl MeetingManager {
    pub async fn start_meeting(&self, title: Option<String>) -> Result<i64> {
        let mut state = self.lock_state();
        if !matches!(*state, ManagerState::Idle) {
            anyhow::bail!("A meeting is already in progress");
        }

        self.preflight()?;

        let mut recorder = AudioRecorder::new()
            .map_err(|e| anyhow::anyhow!("Failed to create meeting audio recorder: {}", e))?
            .with_level_callback({
                let app_handle = self.app_handle.clone();
                move |levels| {
                    crate::overlay::emit_levels(&app_handle, &levels);
                }
            })
            .with_silence_callback({
                let app_handle = self.app_handle.clone();
                move || {
                    emit_audio_warning(&app_handle, AudioSource::Mic, AudioWarningReason::Device)
                }
            });

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

        let app_settings = settings::get_settings(&self.app_handle);
        let captures_system =
            app_settings.meeting_system_audio_enabled && is_system_audio_available();
        // Spawned before the captures so the first sample reaches a live worker.
        let live_workers = self.spawn_live_workers(meeting_id, captures_system);

        self.stopping
            .store(false, std::sync::atomic::Ordering::Relaxed);
        let capture_epoch = self.start_mic_capture(MicCapture {
            meeting_id,
            recorder,
            live_worker: live_workers.mic,
        })?;

        if captures_system {
            self.start_system_capture(SystemCapture {
                meeting_id,
                live_worker: live_workers.system,
                capture_epoch,
            })?;
        }

        *state = ManagerState::Recording(RecordingState {
            meeting_id,
            start_time: now,
        });

        self.emit_status_changed(MeetingStatus::Recording);
        self.emit_active_meeting(Some(ActiveMeeting::Recording {
            meeting_id,
            start_time: now,
        }));

        Ok(meeting_id)
    }

    /// Returns when WAVs written + status=processing; batch pass spawned to runtime.
    pub async fn stop_meeting(self: Arc<Self>) -> Result<()> {
        let recording = {
            let mut state = self.lock_state();
            match std::mem::replace(&mut *state, ManagerState::Processing) {
                ManagerState::Recording(rs) => rs,
                other => {
                    *state = other;
                    anyhow::bail!("No meeting is currently recording");
                }
            }
        };

        self.emit_status_changed(MeetingStatus::Processing);
        self.emit_active_meeting(Some(ActiveMeeting::Processing));

        let result = self.clone().finish_recording(recording).await;
        if let Err(ref error) = result {
            error!("Failed to finish meeting recording: {error:#}");
            // `Processing` is only left by the batch pass, which never runs now — releasing the
            // state here is what keeps the next meeting startable without an app restart.
            *self.lock_state() = ManagerState::Idle;
            self.emit_status_changed(MeetingStatus::Error);
            self.emit_active_meeting(None);
        }
        result
    }

    /// Streams are torn down before any fallible I/O — a failed WAV write must not leave the
    /// microphone, the system capture, or the streaming worker running.
    async fn finish_recording(self: Arc<Self>, recording: RecordingState) -> Result<()> {
        self.stopping
            .store(true, std::sync::atomic::Ordering::Relaxed);
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

        let live_transcripts = self.stop_live_workers();

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
        let files = BatchFiles {
            mic: mic_file,
            system: sys_file,
            system_offset_ms: self.read_system_offset_ms(meeting_id),
        };
        tauri::async_runtime::spawn(async move {
            let guard = BatchGuard::new(manager.clone(), meeting_id);
            let status = match manager.models_ready() {
                Ok(()) => {
                    manager
                        .run_batch_transcription(meeting_id, files, live_transcripts, 0)
                        .await
                }
                Err(reason) => {
                    info!("Meeting {meeting_id} saved without a transcript: {reason}");
                    manager.keep_audio_awaiting_models(meeting_id, &files)
                }
            };
            guard.finish();

            manager.emit_status_changed(status.clone());
            let transcribed = matches!(status, MeetingStatus::Complete | MeetingStatus::Partial);
            if transcribed && settings::get_settings(&manager.app_handle).meeting_auto_summary {
                let _ = manager
                    .app_handle
                    .emit("meeting-auto-summary-requested", meeting_id);
            }
            info!("Meeting {meeting_id} finished as {}", status.as_str());
        });

        Ok(())
    }
}

/// A panicking batch pass used to leave the manager stuck in `Processing`: every later meeting
/// then failed to start until the app was restarted.
pub(super) struct BatchGuard {
    manager: Arc<MeetingManager>,
    meeting_id: i64,
    finished: bool,
}

impl BatchGuard {
    pub(super) fn new(manager: Arc<MeetingManager>, meeting_id: i64) -> Self {
        Self {
            manager,
            meeting_id,
            finished: false,
        }
    }

    pub(super) fn finish(mut self) {
        self.finished = true;
    }
}

impl Drop for BatchGuard {
    fn drop(&mut self) {
        *self.manager.lock_state() = ManagerState::Idle;
        self.manager.emit_active_meeting(None);
        if self.finished {
            return;
        }
        self.manager
            .set_meeting_status(self.meeting_id, &MeetingStatus::Error);
        self.manager.emit_status_changed(MeetingStatus::Error);
    }
}
