//! Every read and write of a stored meeting.

use anyhow::{Context, Result};
use log::info;
use rusqlite::params;
use std::fs;
use tauri::{AppHandle, Emitter};

use super::meeting::MeetingManager;
use super::meeting_mixdown::mix_file_name;
use super::meeting_types::{format_ms_to_hms, Meeting, MeetingSegment, MeetingStatus};

impl MeetingManager {
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
            "SELECT id, title, start_time, end_time, duration_ms, mic_file_name, system_file_name, NULL AS summary, status FROM meetings ORDER BY start_time DESC",
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

        for name in meeting
            .mic_file_name
            .into_iter()
            .chain(meeting.system_file_name)
            .chain(std::iter::once(mix_file_name(id)))
        {
            let _ = fs::remove_file(self.meetings_dir.join(name));
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

    /// The mix carries both voices; a single-stream meeting has none, so its own file plays.
    pub fn get_audio_path(&self, meeting_id: i64) -> Result<Option<String>> {
        let meeting = self.get_meeting(meeting_id)?;
        let found = [
            Some(mix_file_name(meeting_id)),
            meeting.mic_file_name,
            meeting.system_file_name,
        ]
        .into_iter()
        .flatten()
        .map(|name| self.meetings_dir.join(name))
        .find(|path| path.exists());

        match found {
            Some(path) => Ok(Some(
                path.to_str().context("Invalid path encoding")?.to_string(),
            )),
            None => Ok(None),
        }
    }
}
