//! A transcribed utterance becomes a stored row: filtered, inserted, and announced to the page.

use anyhow::Result;
use log::{debug, error};
use rusqlite::{params, Connection};
use tauri::Emitter;

use super::cleanup_apply::clean_transcript;
use super::hallucination::HallucinationFilter;
use super::meeting::{MeetingManager, MeetingSegment, MeetingStatus};
use super::meeting_batch_plan::{ChunkOutcome, PendingSegment};
use crate::settings;

/// What a finished retranscribe pass hands over to take the place of the stored transcript.
pub(super) struct Retranscript {
    pub(super) meeting_id: i64,
    pub(super) status: MeetingStatus,
    pub(super) segments: Vec<MeetingSegment>,
}

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
        match self.keep_segment(&segment) {
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

    fn keep_segment(&self, segment: &MeetingSegment) -> Result<()> {
        if let Some(staged) = self.lock_staged_transcript().as_mut() {
            staged.push(MeetingSegment {
                id: staged.len() as i64 + 1,
                ..segment.clone()
            });
            return Ok(());
        }
        insert_segment(&self.get_connection()?, segment)
    }
}

fn insert_segment(conn: &Connection, segment: &MeetingSegment) -> Result<()> {
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

/// One transaction: the meeting holds its previous transcript or the new one, never a mix. A pass
/// that only failed replaces nothing, and is an error only for a meeting that had no transcript.
pub(super) fn replace_transcript(conn: &mut Connection, retranscript: &Retranscript) -> Result<()> {
    let meeting_id = retranscript.meeting_id;
    let tx = conn.transaction()?;
    if matches!(retranscript.status, MeetingStatus::Error) {
        tx.execute(
            "UPDATE meetings SET status = ?1 WHERE id = ?2 \
             AND NOT EXISTS (SELECT 1 FROM meeting_segments WHERE meeting_id = ?2)",
            params![retranscript.status.as_str(), meeting_id],
        )?;
    } else {
        tx.execute(
            "DELETE FROM meeting_segments WHERE meeting_id = ?1",
            params![meeting_id],
        )?;
        for segment in &retranscript.segments {
            insert_segment(&tx, segment)?;
        }
        tx.execute(
            "UPDATE meetings SET status = ?1 WHERE id = ?2",
            params![retranscript.status.as_str(), meeting_id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::database;
    use super::*;
    use tempfile::TempDir;

    fn open_db() -> (TempDir, Connection) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("history.db");
        database::initialize_database(&db_path).unwrap();
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        (dir, conn)
    }

    fn meeting_with(conn: &Connection, status: &str, lines: &[&str]) -> i64 {
        conn.execute(
            "INSERT INTO meetings (title, start_time, status) VALUES ('Weekly', 1700000000, ?1)",
            params![status],
        )
        .unwrap();
        let meeting_id = conn.last_insert_rowid();
        for line in lines {
            insert_segment(conn, &segment(meeting_id, line)).unwrap();
        }
        meeting_id
    }

    fn segment(meeting_id: i64, text: &str) -> MeetingSegment {
        MeetingSegment {
            id: 0,
            meeting_id,
            speaker_label: "Speaker 1".to_string(),
            start_ms: 0,
            end_ms: 1_000,
            text: text.to_string(),
            confidence: None,
            audio_source: "mic".to_string(),
        }
    }

    fn transcript(conn: &Connection, meeting_id: i64) -> (String, Vec<String>) {
        let status = conn
            .query_row(
                "SELECT status FROM meetings WHERE id = ?1",
                params![meeting_id],
                |row| row.get(0),
            )
            .unwrap();
        let lines = conn
            .prepare("SELECT text FROM meeting_segments WHERE meeting_id = ?1 ORDER BY id")
            .unwrap()
            .query_map(params![meeting_id], |row| row.get(0))
            .unwrap()
            .collect::<Result<Vec<String>, _>>()
            .unwrap();
        (status, lines)
    }

    #[test]
    fn a_finished_retranscribe_shows_only_the_new_transcript() {
        let (_dir, mut conn) = open_db();
        let meeting_id = meeting_with(&conn, "complete", &["old one", "old two"]);

        replace_transcript(
            &mut conn,
            &Retranscript {
                meeting_id,
                status: MeetingStatus::Partial,
                segments: vec![segment(meeting_id, "new one")],
            },
        )
        .unwrap();

        assert_eq!(
            transcript(&conn, meeting_id),
            ("partial".to_string(), vec!["new one".to_string()])
        );
    }

    #[test]
    fn a_replacement_that_breaks_midway_leaves_the_previous_transcript() {
        let (_dir, mut conn) = open_db();
        let meeting_id = meeting_with(&conn, "complete", &["old one", "old two"]);
        let unknown_meeting = meeting_id + 100;

        let replaced = replace_transcript(
            &mut conn,
            &Retranscript {
                meeting_id,
                status: MeetingStatus::Complete,
                segments: vec![
                    segment(meeting_id, "new one"),
                    segment(unknown_meeting, "new two"),
                ],
            },
        );

        assert!(replaced.is_err());
        assert_eq!(
            transcript(&conn, meeting_id),
            (
                "complete".to_string(),
                vec!["old one".to_string(), "old two".to_string()]
            )
        );
    }

    #[test]
    fn a_retranscribe_that_only_failed_keeps_the_previous_transcript_and_status() {
        let (_dir, mut conn) = open_db();
        let meeting_id = meeting_with(&conn, "complete", &["old one"]);

        replace_transcript(
            &mut conn,
            &Retranscript {
                meeting_id,
                status: MeetingStatus::Error,
                segments: Vec::new(),
            },
        )
        .unwrap();

        assert_eq!(
            transcript(&conn, meeting_id),
            ("complete".to_string(), vec!["old one".to_string()])
        );
    }

    #[test]
    fn a_failed_first_transcription_of_a_recorded_meeting_is_an_error() {
        let (_dir, mut conn) = open_db();
        let meeting_id = meeting_with(&conn, "recorded", &[]);

        replace_transcript(
            &mut conn,
            &Retranscript {
                meeting_id,
                status: MeetingStatus::Error,
                segments: Vec::new(),
            },
        )
        .unwrap();

        assert_eq!(
            transcript(&conn, meeting_id),
            ("error".to_string(), Vec::new())
        );
    }
}
