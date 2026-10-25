//! Launch sweep: close out meetings the app never finished, and purge audio past its retention.

use anyhow::{Context, Result};
use log::{error, info};
use rusqlite::{params, Connection};
use std::path::Path;
use tauri::AppHandle;

use super::meeting::MeetingStatus;
use super::meeting_audio_sink::seal_interrupted_track;
use super::meeting_mixdown::mix_file_name;
use super::meeting_types::samples_to_ms;
use crate::settings;

fn interrupted_status(segment_count: i64) -> MeetingStatus {
    if segment_count == 0 {
        MeetingStatus::Recorded
    } else {
        MeetingStatus::Partial
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
    start_time: i64,
    files: Vec<String>,
}

/// A row still recording or processing at launch was cut short: nothing else will ever close it.
fn close_interrupted_meetings(db_path: &Path, meetings_dir: &Path) -> Result<()> {
    let conn = Connection::open(db_path)?;
    let unfinished = query_meetings(
        &conn,
        "SELECT id, start_time, mic_file_name, system_file_name FROM meetings \
         WHERE status IN ('recording', 'processing')",
    )?;

    for meeting in unfinished {
        let duration_ms = samples_to_ms(recover_tracks(&conn, meetings_dir, &meeting)?);
        let segment_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1",
            params![meeting.id],
            |row| row.get(0),
        )?;
        conn.execute(
            "UPDATE meetings SET status = ?1, duration_ms = ?2, end_time = ?3 WHERE id = ?4",
            params![
                interrupted_status(segment_count).as_str(),
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

/// A track no audio reached is dropped, as a stop drops an empty capture.
fn recover_tracks(
    conn: &Connection,
    meetings_dir: &Path,
    meeting: &UnfinishedMeeting,
) -> Result<usize> {
    let mut longest = 0;
    for name in &meeting.files {
        let path = meetings_dir.join(name);
        match seal_interrupted_track(&path) {
            Ok(0) => {
                std::fs::remove_file(&path).with_context(|| format!("remove empty {name}"))?;
                conn.execute(
                    "UPDATE meetings SET mic_file_name = NULLIF(mic_file_name, ?1), \
                     system_file_name = NULLIF(system_file_name, ?1) WHERE id = ?2",
                    params![name, meeting.id],
                )?;
            }
            Ok(samples) => longest = longest.max(samples),
            Err(e) => error!("Failed to recover {name}: {e:#}"),
        }
    }
    Ok(longest)
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
            "SELECT id, start_time, mic_file_name, system_file_name FROM meetings \
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
            let mic: Option<String> = row.get(2)?;
            let system: Option<String> = row.get(3)?;
            Ok(UnfinishedMeeting {
                id: row.get(0)?,
                start_time: row.get(1)?,
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
    use crate::managers::meeting_audio_sink::{write_to_sink, MeetingAudioSink};
    use hound::WavReader;
    use std::sync::Mutex;
    use tempfile::TempDir;

    const FRAME_SAMPLES: usize = 320;

    /// The process dies mid-meeting: no `finish()`, no destructor, only what reached the disk.
    fn record_then_kill(dir: &Path, file_name: &str, seconds: usize) {
        let sink = Mutex::new(Some(
            MeetingAudioSink::create(dir, file_name.into()).unwrap(),
        ));
        for _ in 0..seconds * 16_000 / FRAME_SAMPLES {
            write_to_sink(&sink, &[0.25; FRAME_SAMPLES]);
        }
        std::mem::forget(sink);
    }

    /// Every sample the header claims decodes, and the header claims the whole file.
    fn playable_ms(path: &Path) -> i64 {
        let mut reader = WavReader::open(path).unwrap();
        let claimed = reader.duration() as usize;
        let decoded = reader.samples::<i16>().collect::<Result<Vec<_>, _>>();
        assert_eq!(decoded.unwrap().len(), claimed);
        let bytes = std::fs::read(path).unwrap();
        let riff_len = u32::from_le_bytes(bytes[4..8].try_into().unwrap());
        assert_eq!(
            riff_len as usize + 8,
            bytes.len(),
            "RIFF size must cover the file"
        );
        samples_to_ms(claimed)
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
    fn a_killed_meeting_keeps_the_audio_both_tracks_wrote_to_disk() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("history.db");
        database::initialize_database(&db_path).unwrap();
        record_then_kill(dir.path(), "meeting-1-mic.wav", 5);
        record_then_kill(dir.path(), "meeting-1-system.wav", 3);

        let conn = Connection::open(&db_path).unwrap();
        let crashed = meeting_row(&conn, "recording", Some("meeting-1-mic.wav"));
        conn.execute(
            "UPDATE meetings SET system_file_name = 'meeting-1-system.wav' WHERE id = ?1",
            params![crashed],
        )
        .unwrap();

        close_interrupted_meetings(&db_path, dir.path()).unwrap();

        let duration: i64 = conn
            .query_row(
                "SELECT duration_ms FROM meetings WHERE id = ?1",
                params![crashed],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            (4_000..=5_000).contains(&duration),
            "a kill may cost at most the last second, recovered {duration} ms of 5000"
        );
        assert_eq!(playable_ms(&dir.path().join("meeting-1-mic.wav")), duration);
        let system_ms = playable_ms(&dir.path().join("meeting-1-system.wav"));
        assert!(
            (2_000..=3_000).contains(&system_ms),
            "a kill may cost at most the last second, recovered {system_ms} ms of 3000"
        );
    }

    /// The app quit before a byte of audio was written.
    #[test]
    fn a_meeting_killed_before_any_audio_reached_the_disk_leaves_no_broken_file() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("history.db");
        database::initialize_database(&db_path).unwrap();
        record_then_kill(dir.path(), "meeting-1-mic.wav", 0);

        let conn = Connection::open(&db_path).unwrap();
        let crashed = meeting_row(&conn, "recording", Some("meeting-1-mic.wav"));
        close_interrupted_meetings(&db_path, dir.path()).unwrap();

        let (status, duration, mic): (String, i64, Option<String>) = conn
            .query_row(
                "SELECT status, duration_ms, mic_file_name FROM meetings WHERE id = ?1",
                params![crashed],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!((status.as_str(), duration), ("recorded", 0));
        assert_eq!(
            mic, None,
            "an empty capture is dropped, as a normal stop drops it"
        );
        assert!(!dir.path().join("meeting-1-mic.wav").exists());
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
        assert_eq!(status, "recorded");
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

    #[test]
    fn a_crash_after_some_segments_keeps_them_as_partial() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("history.db");
        database::initialize_database(&db_path).unwrap();
        save_wav_file(dir.path().join("meeting-1-mic.wav"), &vec![0.1; 48_000]).unwrap();

        let conn = Connection::open(&db_path).unwrap();
        let crashed = meeting_row(&conn, "processing", Some("meeting-1-mic.wav"));
        for start_ms in [0_i64, 1_000] {
            conn.execute(
                "INSERT INTO meeting_segments (meeting_id, speaker_label, start_ms, end_ms, text, audio_source) \
                 VALUES (?1, 'Speaker 1', ?2, ?3, 'hello', 'mic')",
                params![crashed, start_ms, start_ms + 1_000],
            )
            .unwrap();
        }

        close_interrupted_meetings(&db_path, dir.path()).unwrap();

        let status: String = conn
            .query_row(
                "SELECT status FROM meetings WHERE id = ?1",
                params![crashed],
                |row| row.get(0),
            )
            .unwrap();
        let kept: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1",
                params![crashed],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "partial");
        assert_eq!(kept, 2);
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
