//! A transcribed utterance becomes a stored row: filtered, inserted, and announced to the page.

use anyhow::Result;
use log::{debug, error};
use rusqlite::params;
use tauri::Emitter;

use super::cleanup_apply::clean_transcript;
use super::hallucination::HallucinationFilter;
use super::meeting::{MeetingManager, MeetingSegment};
use super::meeting_batch_plan::{ChunkOutcome, PendingSegment};
use crate::settings;

impl MeetingManager {
    pub(super) fn store_segment_text(
        &self,
        text: &str,
        pending: PendingSegment,
        filter: HallucinationFilter,
    ) -> ChunkOutcome {
        let settings = settings::get_settings(&self.app_handle);
        let cleaned = clean_transcript(text.trim(), filter, &settings);
        if cleaned.is_empty() {
            debug!(
                "Skipped chunk at {}ms (empty or hallucination): {:?}",
                pending.start_ms,
                text.trim()
            );
            return ChunkOutcome::Skipped;
        }

        let segment = MeetingSegment {
            id: 0,
            meeting_id: pending.meeting_id,
            speaker_label: pending.speaker_label,
            start_ms: pending.start_ms,
            end_ms: pending.end_ms,
            text: cleaned,
            confidence: None,
            audio_source: pending.source.as_str().to_string(),
        };
        match self.insert_segment(&segment) {
            Ok(()) => {
                let _ = self.app_handle.emit("meeting-segment-added", &segment);
                ChunkOutcome::Inserted
            }
            Err(e) => {
                error!("Failed to insert meeting segment: {e:#}");
                ChunkOutcome::Failed
            }
        }
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
}
