//! Database operations for persisting input tracking entries.

use super::types::InputEntry;
use rusqlite::Connection;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

/// Save an input entry to the database and emit event to frontend
pub fn save_entry_to_db(db_path: &PathBuf, entry: &InputEntry, app_handle: &AppHandle) {
    match Connection::open(db_path) {
        Ok(conn) => {
            // Ensure table exists (handles migration edge cases)
            let table_exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='input_entries'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !table_exists {
                log::warn!(
                    "[InputTracker] Creating input_entries table (migration may have been skipped)"
                );
                if let Err(e) = conn.execute_batch(
                    "CREATE TABLE IF NOT EXISTS input_entries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        app_name TEXT NOT NULL,
                        app_bundle_id TEXT,
                        window_title TEXT,
                        content TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        duration_ms INTEGER DEFAULT 0,
                        app_pid INTEGER
                    );
                    CREATE INDEX IF NOT EXISTS idx_input_entries_timestamp ON input_entries(timestamp);
                    CREATE INDEX IF NOT EXISTS idx_input_entries_app ON input_entries(app_bundle_id)",
                ) {
                    log::error!("[InputTracker] Failed to create table: {}", e);
                    return;
                }
            } else {
                // Check if app_pid column exists, add it if missing (handles upgrade from older versions)
                let has_app_pid: bool = conn
                    .prepare("PRAGMA table_info(input_entries)")
                    .and_then(|mut stmt| {
                        let columns: Vec<String> = stmt
                            .query_map([], |row| row.get::<_, String>(1))
                            .map(|iter| iter.filter_map(|r| r.ok()).collect())
                            .unwrap_or_default();
                        Ok(columns.iter().any(|c| c == "app_pid"))
                    })
                    .unwrap_or(false);

                if !has_app_pid {
                    log::info!("[InputTracker] Adding app_pid column to input_entries table");
                    if let Err(e) =
                        conn.execute("ALTER TABLE input_entries ADD COLUMN app_pid INTEGER", [])
                    {
                        log::error!("[InputTracker] Failed to add app_pid column: {}", e);
                        // Continue anyway, we'll just not save the pid
                    }
                }
            }

            let result = conn.execute(
                "INSERT INTO input_entries (app_name, app_bundle_id, window_title, content, timestamp, duration_ms, app_pid) 
                 VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)",
                (
                    &entry.app_name,
                    &entry.app_bundle_id,
                    &entry.content,
                    entry.timestamp,
                    entry.duration_ms,
                    entry.app_pid,
                ),
            );

            match result {
                Ok(_) => {
                    log::info!(
                        "[InputTracker] Saved to DB: app={} (pid={:?}), len={}",
                        entry.app_name,
                        entry.app_pid,
                        entry.content.len()
                    );
                    // Emit event to notify frontend
                    if let Err(e) = app_handle.emit("input-entries-updated", ()) {
                        log::warn!("[InputTracker] Failed to emit update event: {}", e);
                    }
                }
                Err(e) => log::error!("[InputTracker] DB save failed: {}", e),
            }
        }
        Err(e) => log::error!("[InputTracker] DB open failed: {}", e),
    }
}
