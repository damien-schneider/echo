use anyhow::{Context, Result};
use chrono::{DateTime, Local, Utc};
use log::{debug, error};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

use super::database;
use crate::audio_toolkit::{load_wav_file, save_wav_file};
use crate::settings::RecordingRetentionPeriod;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub file_name: String,
    pub timestamp: i64,
    pub saved: bool,
    pub title: String,
    pub transcription_text: String,
    pub post_processed_text: Option<String>,
    pub post_process_prompt: Option<String>,
}

pub struct HistoryManager {
    app_handle: AppHandle,
    recordings_dir: PathBuf,
    db_path: PathBuf,
}

impl HistoryManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = app_handle.path().app_data_dir()?;
        let recordings_dir = app_data_dir.join("recordings");
        let db_path = app_data_dir.join("history.db");

        fs::create_dir_all(&recordings_dir)?;
        database::initialize_database(&db_path).context("Failed to initialize history database")?;

        Ok(Self {
            app_handle: app_handle.clone(),
            recordings_dir,
            db_path,
        })
    }

    fn get_connection(&self) -> Result<Connection> {
        connect(&self.db_path)
    }

    pub async fn save_transcription(
        &self,
        audio_samples: Vec<f32>,
        transcription_text: String,
        post_processed_text: Option<String>,
        post_process_prompt: Option<String>,
    ) -> Result<i64> {
        let timestamp = Utc::now().timestamp();
        let entry = NewEntry {
            timestamp,
            title: self.format_timestamp_title(timestamp),
            audio_samples,
            transcription_text,
            post_processed_text,
            post_process_prompt,
        };
        let id = store_entry(&self.db_path, &self.recordings_dir, entry).await?;

        if let Err(e) = self.cleanup_old_entries() {
            error!("Failed to clean up old history entries: {e:#}");
        }
        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(id)
    }

    pub(crate) fn rename_entry(&self, id: i64, title: &str) -> Result<()> {
        set_entry_title(&self.get_connection()?, id, title)?;
        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }
        Ok(())
    }

    pub fn cleanup_old_entries(&self) -> Result<()> {
        let retention_period = crate::settings::get_recording_retention_period(&self.app_handle);

        match retention_period {
            RecordingRetentionPeriod::Never => Ok(()),
            RecordingRetentionPeriod::PreserveLimit => {
                let limit = crate::settings::get_history_limit(&self.app_handle);
                self.cleanup_by_count(limit)
            }
            RecordingRetentionPeriod::Days3
            | RecordingRetentionPeriod::Weeks2
            | RecordingRetentionPeriod::Months3 => self.cleanup_by_time(retention_period),
        }
    }

    fn delete_entries_and_files(&self, entries: &[(i64, String)]) -> Result<usize> {
        if entries.is_empty() {
            return Ok(0);
        }

        let conn = self.get_connection()?;
        let mut deleted_count = 0;

        for (id, file_name) in entries {
            conn.execute(
                "DELETE FROM transcription_history WHERE id = ?1",
                params![id],
            )?;

            let file_path = self.recordings_dir.join(file_name);
            if file_path.exists() {
                if let Err(e) = fs::remove_file(&file_path) {
                    error!("Failed to delete WAV file {}: {}", file_name, e);
                } else {
                    debug!("Deleted old WAV file: {}", file_name);
                    deleted_count += 1;
                }
            }
        }

        Ok(deleted_count)
    }

    fn cleanup_by_count(&self, limit: usize) -> Result<()> {
        let conn = self.get_connection()?;

        let mut stmt = conn.prepare(
            "SELECT id, file_name FROM transcription_history WHERE saved = 0 ORDER BY timestamp DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>("id")?, row.get::<_, String>("file_name")?))
        })?;

        let mut entries: Vec<(i64, String)> = Vec::new();
        for row in rows {
            entries.push(row?);
        }

        if entries.len() > limit {
            let entries_to_delete = &entries[limit..];
            let deleted_count = self.delete_entries_and_files(entries_to_delete)?;
            if deleted_count > 0 {
                debug!("Cleaned up {} old history entries by count", deleted_count);
            }
        }

        Ok(())
    }

    fn cleanup_by_time(&self, retention_period: RecordingRetentionPeriod) -> Result<()> {
        let conn = self.get_connection()?;

        let Some(cutoff_timestamp) = retention_period.cutoff_timestamp(Utc::now().timestamp())
        else {
            return Ok(());
        };

        let mut stmt = conn.prepare(
            "SELECT id, file_name FROM transcription_history WHERE saved = 0 AND timestamp < ?1",
        )?;

        let rows = stmt.query_map(params![cutoff_timestamp], |row| {
            Ok((row.get::<_, i64>("id")?, row.get::<_, String>("file_name")?))
        })?;

        let mut entries_to_delete: Vec<(i64, String)> = Vec::new();
        for row in rows {
            entries_to_delete.push(row?);
        }

        let deleted_count = self.delete_entries_and_files(&entries_to_delete)?;
        if deleted_count > 0 {
            debug!(
                "Cleaned up {} old history entries based on retention period",
                deleted_count
            );
        }

        Ok(())
    }

    pub async fn get_history_entries(&self) -> Result<Vec<HistoryEntry>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt FROM transcription_history ORDER BY timestamp DESC"
        )?;

        let entries = stmt
            .query_map([], entry_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries)
    }

    pub async fn toggle_saved_status(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        let current_saved: bool = conn.query_row(
            "SELECT saved FROM transcription_history WHERE id = ?1",
            params![id],
            |row| row.get("saved"),
        )?;

        let new_saved = !current_saved;

        conn.execute(
            "UPDATE transcription_history SET saved = ?1 WHERE id = ?2",
            params![new_saved, id],
        )?;

        debug!("Toggled saved status for entry {}: {}", id, new_saved);

        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    pub fn get_audio_file_path(&self, file_name: &str) -> PathBuf {
        self.recordings_dir.join(file_name)
    }

    pub async fn get_entry_by_id(&self, id: i64) -> Result<Option<HistoryEntry>> {
        let conn = self.get_connection()?;
        let entry = conn
            .query_row(
                "SELECT id, file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt
                 FROM transcription_history WHERE id = ?1",
                [id],
                entry_from_row,
            )
            .optional()?;
        Ok(entry)
    }

    pub async fn delete_entry(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        if let Some(entry) = self.get_entry_by_id(id).await? {
            let file_path = self.get_audio_file_path(&entry.file_name);
            if file_path.exists() {
                if let Err(e) = fs::remove_file(&file_path) {
                    error!("Failed to delete audio file {}: {}", entry.file_name, e);
                }
            }
        }

        conn.execute(
            "DELETE FROM transcription_history WHERE id = ?1",
            params![id],
        )?;

        debug!("Deleted history entry with id: {}", id);

        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    fn format_timestamp_title(&self, timestamp: i64) -> String {
        if let Some(utc_datetime) = DateTime::from_timestamp(timestamp, 0) {
            let local_datetime = utc_datetime.with_timezone(&Local);
            local_datetime.format("%B %e, %Y - %l:%M%p").to_string()
        } else {
            format!("Recording {}", timestamp)
        }
    }

    pub async fn retranscribe_entry(&self, id: i64, new_transcription: String) -> Result<()> {
        let conn = self.get_connection()?;

        conn.execute(
            "UPDATE transcription_history SET transcription_text = ?1, post_processed_text = NULL, post_process_prompt = NULL WHERE id = ?2",
            params![new_transcription, id],
        )?;

        debug!("Retranscribed history entry with id: {}", id);

        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    pub fn load_audio_for_entry(&self, file_name: &str) -> Result<Vec<f32>> {
        let file_path = self.get_audio_file_path(file_name);
        load_wav_file(&file_path)
    }

    pub async fn update_post_processed_text(
        &self,
        id: i64,
        post_processed_text: Option<String>,
        post_process_prompt: Option<String>,
    ) -> Result<()> {
        let conn = self.get_connection()?;

        conn.execute(
            "UPDATE transcription_history SET post_processed_text = ?1, post_process_prompt = ?2 WHERE id = ?3",
            params![post_processed_text, post_process_prompt, id],
        )?;

        debug!(
            "Updated post-processed text for history entry with id: {}",
            id
        );

        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }
}

struct NewEntry {
    timestamp: i64,
    title: String,
    audio_samples: Vec<f32>,
    transcription_text: String,
    post_processed_text: Option<String>,
    post_process_prompt: Option<String>,
}

fn connect(db_path: &Path) -> Result<Connection> {
    Connection::open(db_path).with_context(|| format!("Failed to open database at {db_path:?}"))
}

/// A recording that cannot be written must not cost the text.
async fn store_entry(db_path: &Path, recordings_dir: &Path, entry: NewEntry) -> Result<i64> {
    let (id, file_name) = insert_entry(&mut connect(db_path)?, &entry)?;
    let recordings_dir = recordings_dir.to_path_buf();
    let written = tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&recordings_dir)?;
        save_wav_file(recordings_dir.join(file_name), &entry.audio_samples)
    })
    .await
    .context("WAV writer thread panicked")
    .and_then(|written| written);
    if let Err(e) = written {
        error!("History entry {id} saved without its recording: {e:#}");
    }
    Ok(id)
}

/// Second-resolution names alone let two saves share one recording.
fn insert_entry(conn: &mut Connection, entry: &NewEntry) -> Result<(i64, String)> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO transcription_history (file_name, timestamp, title, transcription_text, post_processed_text, post_process_prompt) VALUES ('', ?1, ?2, ?3, ?4, ?5)",
        params![entry.timestamp, entry.title, entry.transcription_text, entry.post_processed_text, entry.post_process_prompt],
    )?;
    let id = tx.last_insert_rowid();
    let file_name = format!("echo-{}-{id}.wav", entry.timestamp);
    tx.execute(
        "UPDATE transcription_history SET file_name = ?1 WHERE id = ?2",
        params![file_name, id],
    )?;
    tx.commit()?;
    Ok((id, file_name))
}

fn set_entry_title(conn: &Connection, id: i64, title: &str) -> Result<()> {
    conn.execute(
        "UPDATE transcription_history SET title = ?1 WHERE id = ?2",
        params![title, id],
    )?;
    Ok(())
}

fn entry_from_row(row: &rusqlite::Row) -> rusqlite::Result<HistoryEntry> {
    Ok(HistoryEntry {
        id: row.get("id")?,
        file_name: row.get("file_name")?,
        timestamp: row.get("timestamp")?,
        saved: row.get("saved")?,
        title: row.get("title")?,
        transcription_text: row.get("transcription_text")?,
        post_processed_text: row.get("post_processed_text")?,
        post_process_prompt: row.get("post_process_prompt")?,
    })
}

#[cfg(test)]
#[path = "history_tests.rs"]
mod tests;
