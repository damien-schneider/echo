//! A transcribed utterance becomes a stored row: filtered, inserted, and announced to the page.

use anyhow::Result;
use log::{debug, error};
use rusqlite::params;
use tauri::{Emitter, Manager};

use super::hallucination::{is_hallucination, HallucinationFilter};
use super::meeting::{MeetingManager, MeetingSegment};
use super::meeting_batch_plan::{ChunkOutcome, PendingSegment};
use crate::commands::cleanup::{build_context_from_app_settings, CleanupState};
use crate::managers::cleanup_apply::cleanup_or_filter;
use crate::settings;

impl MeetingManager {
    pub(super) fn store_segment_text(
        &self,
        text: &str,
        pending: PendingSegment,
        filter: HallucinationFilter,
    ) -> ChunkOutcome {
        let cleaned = self.apply_cleanup_filter(text.trim(), filter);
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

    fn apply_cleanup_filter(&self, text: &str, filter: HallucinationFilter) -> String {
        let settings = settings::get_settings(&self.app_handle);
        let Some(cleanup_state) = self.app_handle.try_state::<CleanupState>() else {
            // Test harness: hallucination filter only.
            if is_hallucination(text, filter) {
                return String::new();
            }
            return text.to_string();
        };
        let cleanup_state = cleanup_state.inner().clone();
        cleanup_or_filter(text, filter, &cleanup_state, &settings, || {
            build_context_from_app_settings(&settings)
        })
    }
}
