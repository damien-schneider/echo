//! What must hold before the first sample: room on disk to record into. Missing models never
//! block a start — capture is the one part that cannot be redone, transcription can.

use anyhow::Result;
use log::warn;
use std::path::Path;
use std::sync::Arc;
use tauri::Manager;

use super::diarization::DiarizationManager;
use super::meeting::MeetingManager;
use super::meeting_types::SAMPLE_RATE;
use super::model::ModelManager;
use super::transcription_profiles::transcription_profile_id;
use crate::settings;

/// Both tracks are 16-bit mono at 16 kHz, and the playback mix writes a third copy of them.
const BYTES_PER_SECOND: u64 = 3 * 2 * SAMPLE_RATE as u64;

/// Filling the disk 40 minutes in costs the recording; refusing to start costs a sentence. A
/// meeting may start when there is room for two hours of it.
const MIN_FREE_BYTES: u64 = 2 * 3600 * BYTES_PER_SECOND;

impl MeetingManager {
    pub(super) fn preflight(&self) -> Result<()> {
        if insufficient_space(available_bytes(&self.meetings_dir)) {
            anyhow::bail!(
                "Not enough free disk space to record a meeting — about {} MB is needed.",
                MIN_FREE_BYTES / 1_000_000
            );
        }
        Ok(())
    }

    /// Gates the passes that need both models: retranscribe would destroy the transcript it was
    /// asked to rebuild, and the stop-time batch would fail every chunk.
    pub(super) fn models_ready(&self) -> Result<()> {
        if !self.diarization_ready() {
            anyhow::bail!("Download the speaker detection model in Meeting Settings.");
        }
        if !self.transcription_ready() {
            anyhow::bail!("Download your transcription model in Settings.");
        }
        Ok(())
    }

    fn diarization_ready(&self) -> bool {
        self.app_handle
            .try_state::<Arc<DiarizationManager>>()
            .is_some_and(|manager| manager.is_available())
    }

    /// The batch pass loads this model once the meeting is over: a missing one is only found out
    /// after the last word was said.
    pub(super) fn transcription_ready(&self) -> bool {
        let Some(models) = self.app_handle.try_state::<Arc<ModelManager>>() else {
            return false;
        };
        let size = settings::get_settings(&self.app_handle).transcription_model_size;
        models
            .get_model_info(transcription_profile_id(size))
            .is_some_and(|model| model.is_downloaded)
    }
}

fn insufficient_space(available: Option<u64>) -> bool {
    available.is_some_and(|free| free < MIN_FREE_BYTES)
}

/// `None` on a volume that will not answer: a check that cannot run must not block a meeting.
fn available_bytes(dir: &Path) -> Option<u64> {
    fs4::available_space(dir)
        .inspect_err(|e| warn!("Could not read free space of {}: {e}", dir.display()))
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_toolkit::audio::save_wav_file;
    use tempfile::TempDir;

    /// The floor is only honest while a recorded second still weighs what it claims: a switch to
    /// 32-bit samples would halve the hours this leaves room for.
    #[test]
    fn a_recorded_second_weighs_what_the_free_space_floor_assumes() {
        let dir = TempDir::new().unwrap();
        let one = dir.path().join("one.wav");
        let three = dir.path().join("three.wav");
        save_wav_file(&one, &vec![0.0; SAMPLE_RATE]).unwrap();
        save_wav_file(&three, &vec![0.0; 3 * SAMPLE_RATE]).unwrap();

        let per_second =
            (std::fs::metadata(&three).unwrap().len() - std::fs::metadata(&one).unwrap().len()) / 2;
        assert_eq!(3 * per_second, BYTES_PER_SECOND);
    }

    #[test]
    fn a_disk_too_full_to_hold_the_meeting_refuses_to_start_it() {
        assert!(insufficient_space(Some(200 * 1024 * 1024)));
        assert!(!insufficient_space(Some(50 * 1024 * 1024 * 1024)));
        assert!(
            !insufficient_space(None),
            "free space we cannot read must not block a meeting"
        );
    }
}
