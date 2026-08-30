//! Launch sweep: close out meetings the app never finished, and purge audio past its retention.

use anyhow::Result;
use log::{error, info};
use rusqlite::{params, Connection};
use std::path::Path;
use tauri::AppHandle;

use super::meeting::MeetingStatus;
use super::meeting_batch::wav_sample_count;
use super::meeting_mixdown::mix_file_name;
use crate::settings;

const SAMPLES_PER_MS: i64 = 16;

/// A row still claiming to record or process was cut short by a crash, a kill, or a power loss:
/// nothing is going to finish it, so it is closed with whatever audio reached the disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum RecoveryAction {
    Leave,
    Interrupted { duration_ms: i64 },
}

pub(super) fn recovery_action(status: &str, recorded_samples: usize) -> RecoveryAction {
    match MeetingStatus::from_str(status) {
        MeetingStatus::Recording | MeetingStatus::Processing => RecoveryAction::Interrupted {
            duration_ms: recorded_samples as i64 / SAMPLES_PER_MS,
        },
        MeetingStatus::Recorded
        | MeetingStatus::Complete
        | MeetingStatus::Partial
        | MeetingStatus::Error => RecoveryAction::Leave,
    }
}

pub(super) fn sweep(app: &AppHandle, db_path: &Path, meetings_dir: &Path) {
    if let Err(e) = close_interrupted_meetings(db_path, meetings_dir) {
        error!("Failed to recover interrupted meetings: {e:#}");
    }
    if let Err(e) = purge_expired_audio(app, db_path, meetings_dir) {
        error!("Failed to purge expired meeting audio: {e:#}");
    }
}

struct UnfinishedMeeting {
    id: i64,
    status: String,
    start_time: i64,
    files: Vec<String>,
}

fn close_interrupted_meetings(db_path: &Path, meetings_dir: &Path) -> Result<()> {
    let conn = Connection::open(db_path)?;
    let unfinished = query_meetings(
        &conn,
        "SELECT id, status, start_time, mic_file_name, system_file_name FROM meetings \
         WHERE status IN ('recording', 'processing')",
    )?;

    for meeting in unfinished {
        let recorded_samples = meeting
            .files
            .iter()
            .filter_map(|name| wav_sample_count(&meetings_dir.join(name)).ok())
            .max()
            .unwrap_or(0);

        let RecoveryAction::Interrupted { duration_ms } =
            recovery_action(&meeting.status, recorded_samples)
        else {
            continue;
        };

        conn.execute(
            "UPDATE meetings SET status = ?1, duration_ms = ?2, end_time = ?3 WHERE id = ?4",
            params![
                MeetingStatus::Error.as_str(),
                duration_ms,
                meeting.start_time + duration_ms / 1000,
                meeting.id,
            ],
        )?;
        info!(
            "Recovered interrupted meeting {} with {duration_ms}ms of audio",
            meeting.id
        );
    }
    Ok(())
}

/// Transcript and summary are what the user comes back for; the WAVs behind them cost ~115 MB an
/// hour per stream and would otherwise grow forever.
fn purge_expired_audio(app: &AppHandle, db_path: &Path, meetings_dir: &Path) -> Result<()> {
    let Some(cutoff) = settings::get_recording_retention_period(app)
        .cutoff_timestamp(chrono::Utc::now().timestamp())
    else {
        return Ok(());
    };

    let conn = Connection::open(db_path)?;
    let expired = query_meetings(
        &conn,
        &format!(
            "SELECT id, status, start_time, mic_file_name, system_file_name FROM meetings \
             WHERE start_time < {cutoff} \
             AND (mic_file_name IS NOT NULL OR system_file_name IS NOT NULL)"
        ),
    )?;

    for meeting in expired {
        for name in meeting
            .files
            .iter()
            .cloned()
            .chain(std::iter::once(mix_file_name(meeting.id)))
        {
            let path = meetings_dir.join(&name);
            if path.exists() {
                if let Err(e) = std::fs::remove_file(&path) {
                    error!("Failed to delete expired meeting audio {name}: {e}");
                }
            }
        }
        conn.execute(
            "UPDATE meetings SET mic_file_name = NULL, system_file_name = NULL WHERE id = ?1",
            params![meeting.id],
        )?;
        info!("Purged audio of meeting {} past its retention", meeting.id);
    }
    Ok(())
}

fn query_meetings(conn: &Connection, sql: &str) -> Result<Vec<UnfinishedMeeting>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map([], |row| {
            let mic: Option<String> = row.get(3)?;
            let system: Option<String> = row.get(4)?;
            Ok(UnfinishedMeeting {
                id: row.get(0)?,
                status: row.get(1)?,
                start_time: row.get(2)?,
                files: mic.into_iter().chain(system).collect(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_toolkit::audio::save_wav_file;
    use crate::managers::database;
    use tempfile::TempDir;

    #[test]
    fn a_finished_meeting_is_left_alone() {
        assert_eq!(recovery_action("complete", 160_000), RecoveryAction::Leave);
        assert_eq!(recovery_action("error", 0), RecoveryAction::Leave);
    }

    #[test]
    fn a_meeting_cut_short_while_recording_keeps_the_audio_it_reached() {
        assert_eq!(
            recovery_action("recording", 16_000),
            RecoveryAction::Interrupted { duration_ms: 1_000 }
        );
    }

    /// The batch pass dies with the app; nothing would ever leave `processing`.
    #[test]
    fn a_meeting_cut_short_while_processing_is_recovered_too() {
        assert_eq!(
            recovery_action("processing", 32_000),
            RecoveryAction::Interrupted { duration_ms: 2_000 }
        );
    }

    #[test]
    fn a_crash_before_the_first_sample_still_closes_the_row() {
        assert_eq!(
            recovery_action("recording", 0),
            RecoveryAction::Interrupted { duration_ms: 0 }
        );
    }

    fn meeting_row(conn: &Connection, status: &str, mic: Option<&str>) -> i64 {
        conn.execute(
            "INSERT INTO meetings (title, start_time, status, mic_file_name) VALUES (?1, ?2, ?3, ?4)",
            params!["Interrupted", 1_700_000_000_i64, status, mic],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn the_sweep_closes_a_crashed_recording_with_its_real_duration() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("history.db");
        database::initialize_database(&db_path).unwrap();
        save_wav_file(dir.path().join("meeting-1-mic.wav"), &vec![0.1; 48_000]).unwrap();

        let conn = Connection::open(&db_path).unwrap();
        let crashed = meeting_row(&conn, "recording", Some("meeting-1-mic.wav"));
        let finished = meeting_row(&conn, "complete", Some("meeting-1-mic.wav"));

        close_interrupted_meetings(&db_path, dir.path()).unwrap();

        let (status, duration, end_time): (String, i64, i64) = conn
            .query_row(
                "SELECT status, duration_ms, end_time FROM meetings WHERE id = ?1",
                params![crashed],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(status, "error");
        assert_eq!(duration, 3_000);
        assert_eq!(end_time, 1_700_000_003);

        let untouched: String = conn
            .query_row(
                "SELECT status FROM meetings WHERE id = ?1",
                params![finished],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(untouched, "complete");
    }

    /// File names are written when recording starts, so the WAV is reachable even after a kill.
    #[test]
    fn a_crashed_meeting_keeps_the_file_name_that_makes_it_playable() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("history.db");
        database::initialize_database(&db_path).unwrap();
        save_wav_file(dir.path().join("meeting-1-mic.wav"), &vec![0.1; 16_000]).unwrap();

        let conn = Connection::open(&db_path).unwrap();
        let crashed = meeting_row(&conn, "recording", Some("meeting-1-mic.wav"));
        close_interrupted_meetings(&db_path, dir.path()).unwrap();

        let mic: Option<String> = conn
            .query_row(
                "SELECT mic_file_name FROM meetings WHERE id = ?1",
                params![crashed],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(mic.as_deref(), Some("meeting-1-mic.wav"));
    }
}
