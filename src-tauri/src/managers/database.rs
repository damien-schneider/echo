use anyhow::{Context, Result};
use log::{debug, info};
use rusqlite::Connection;
use std::path::Path;

/// Bump when adding a migration.
const CURRENT_SCHEMA_VERSION: u32 = 6;

struct Migration {
    version: u32,
    description: &'static str,
    sql: &'static str,
}

/// Ordered — runner applies each exactly once.
const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "create_transcription_history_table",
        sql: "CREATE TABLE transcription_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            saved INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            transcription_text TEXT NOT NULL
        )",
    },
    Migration {
        version: 2,
        description: "add_post_processed_text_column",
        sql: "ALTER TABLE transcription_history ADD COLUMN post_processed_text TEXT",
    },
    Migration {
        version: 3,
        description: "add_post_process_prompt_column",
        sql: "ALTER TABLE transcription_history ADD COLUMN post_process_prompt TEXT",
    },
    Migration {
        version: 4,
        description: "create_input_entries_table",
        sql: "CREATE TABLE input_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_name TEXT NOT NULL,
            app_bundle_id TEXT,
            window_title TEXT,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            duration_ms INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_input_entries_timestamp ON input_entries(timestamp);
        CREATE INDEX IF NOT EXISTS idx_input_entries_app ON input_entries(app_bundle_id)",
    },
    Migration {
        version: 5,
        description: "add_app_pid_column",
        sql: "ALTER TABLE input_entries ADD COLUMN app_pid INTEGER",
    },
    Migration {
        version: 6,
        description: "create_meetings_tables",
        sql: "CREATE TABLE meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            start_time INTEGER NOT NULL,
            end_time INTEGER,
            duration_ms INTEGER,
            mic_file_name TEXT,
            system_file_name TEXT,
            summary TEXT,
            status TEXT NOT NULL DEFAULT 'recording'
        );
        CREATE TABLE meeting_segments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            speaker_label TEXT NOT NULL,
            start_ms INTEGER NOT NULL,
            end_ms INTEGER NOT NULL,
            text TEXT NOT NULL,
            confidence REAL,
            audio_source TEXT NOT NULL DEFAULT 'mic'
        );
        CREATE INDEX idx_segments_meeting ON meeting_segments(meeting_id);
        CREATE INDEX idx_segments_time ON meeting_segments(start_ms)",
    },
];

/// Idempotent; fails if the on-disk schema is newer than this build.
pub fn initialize_database(db_path: &Path) -> Result<()> {
    let conn = Connection::open(db_path)
        .with_context(|| format!("Failed to open database at {:?}", db_path))?;

    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;",
    )
    .context("Failed to set database pragmas")?;

    // legacy table left by tauri-plugin-sql
    let has_sqlx_migrations = check_table_exists(&conn, "_sqlx_migrations")?;
    let has_schema_version = check_table_exists(&conn, "schema_version")?;
    let has_history_table = check_table_exists(&conn, "transcription_history")?;

    if has_sqlx_migrations && !has_schema_version {
        migrate_from_sqlx(&conn)?;
    } else if !has_schema_version {
        create_schema_version_table(&conn)?;

        if has_history_table {
            let detected_version = detect_schema_version(&conn)?;
            set_schema_version(&conn, detected_version)?;
            info!(
                "Detected existing database at schema version {}",
                detected_version
            );
        }
    }

    run_migrations(&conn)?;

    let final_version = get_schema_version(&conn)?;
    debug!(
        "Database initialized at {:?}, schema version: {}",
        db_path, final_version
    );

    Ok(())
}

fn check_table_exists(conn: &Connection, table_name: &str) -> Result<bool> {
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [table_name],
            |row| row.get(0),
        )
        .context("Failed to check if table exists")?;

    Ok(count > 0)
}

fn check_column_exists(conn: &Connection, table_name: &str, column_name: &str) -> Result<bool> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", table_name))
        .context("Failed to prepare table_info query")?;

    let columns: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()
        .context("Failed to read column info")?;

    Ok(columns.contains(&column_name.to_string()))
}

fn create_schema_version_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE schema_version (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )
    .context("Failed to create schema_version table")?;

    conn.execute(
        "INSERT INTO schema_version (id, version, updated_at) VALUES (1, 0, strftime('%s', 'now'))",
        [],
    )
    .context("Failed to initialize schema version")?;

    debug!("Created schema_version table");
    Ok(())
}

fn get_schema_version(conn: &Connection) -> Result<u32> {
    let version: u32 = conn
        .query_row(
            "SELECT version FROM schema_version WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .context("Failed to read schema version")?;

    Ok(version)
}

fn set_schema_version(conn: &Connection, version: u32) -> Result<()> {
    conn.execute(
        "UPDATE schema_version SET version = ?1, updated_at = strftime('%s', 'now') WHERE id = 1",
        [version],
    )
    .context("Failed to update schema version")?;

    Ok(())
}

/// Fallback for databases created before version tracking existed.
fn detect_schema_version(conn: &Connection) -> Result<u32> {
    if !check_table_exists(conn, "transcription_history")? {
        return Ok(0);
    }

    let has_input_entries = check_table_exists(conn, "input_entries")?;
    let has_app_pid = check_column_exists(conn, "input_entries", "app_pid")?;
    let has_post_process_prompt =
        check_column_exists(conn, "transcription_history", "post_process_prompt")?;
    let has_post_processed_text =
        check_column_exists(conn, "transcription_history", "post_processed_text")?;

    let has_meetings = check_table_exists(conn, "meetings")?;

    if has_meetings {
        Ok(6)
    } else if has_input_entries && has_app_pid {
        Ok(5)
    } else if has_input_entries {
        Ok(4)
    } else if has_post_process_prompt {
        Ok(3)
    } else if has_post_processed_text {
        Ok(2)
    } else {
        Ok(1)
    }
}

fn migrate_from_sqlx(conn: &Connection) -> Result<()> {
    info!("Migrating from tauri-plugin-sql to native schema management");

    create_schema_version_table(conn)?;

    let detected_version = detect_schema_version(conn)?;
    set_schema_version(conn, detected_version)?;

    info!(
        "Migrated from sqlx, detected schema version: {}",
        detected_version
    );
    Ok(())
}

fn run_migrations(conn: &Connection) -> Result<()> {
    let current_version = get_schema_version(conn)?;

    if current_version > CURRENT_SCHEMA_VERSION {
        anyhow::bail!(
            "Database schema version ({}) is newer than application expects ({}). \
             This may indicate the database was used with a newer version of the application.",
            current_version,
            CURRENT_SCHEMA_VERSION
        );
    }

    if current_version == CURRENT_SCHEMA_VERSION {
        debug!(
            "Database schema is up to date (version {})",
            current_version
        );
        return Ok(());
    }

    info!(
        "Running migrations from version {} to {}",
        current_version, CURRENT_SCHEMA_VERSION
    );

    for migration in MIGRATIONS.iter() {
        if migration.version <= current_version {
            continue;
        }

        debug!(
            "Applying migration {}: {}",
            migration.version, migration.description
        );

        // savepoint per migration — a failure rolls back only that one
        conn.execute_batch(&format!(
            "SAVEPOINT migration_{version};
             {sql};
             RELEASE migration_{version};",
            version = migration.version,
            sql = migration.sql
        ))
        .with_context(|| {
            format!(
                "Failed to apply migration {}: {}",
                migration.version, migration.description
            )
        })?;

        set_schema_version(conn, migration.version)?;

        info!(
            "Applied migration {}: {}",
            migration.version, migration.description
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_fresh_database_initialization() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        initialize_database(&db_path).unwrap();

        let conn = Connection::open(&db_path).unwrap();
        let version = get_schema_version(&conn).unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);

        assert!(check_table_exists(&conn, "transcription_history").unwrap());
        assert!(
            check_column_exists(&conn, "transcription_history", "post_processed_text").unwrap()
        );
        assert!(
            check_column_exists(&conn, "transcription_history", "post_process_prompt").unwrap()
        );
    }

    #[test]
    fn test_idempotent_initialization() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        initialize_database(&db_path).unwrap();
        initialize_database(&db_path).unwrap();

        let conn = Connection::open(&db_path).unwrap();
        let version = get_schema_version(&conn).unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn test_detect_existing_schema() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        // v1 shape
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "CREATE TABLE transcription_history (
                id INTEGER PRIMARY KEY,
                file_name TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                saved INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                transcription_text TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        drop(conn);

        initialize_database(&db_path).unwrap();

        let conn = Connection::open(&db_path).unwrap();
        let version = get_schema_version(&conn).unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);

        assert!(
            check_column_exists(&conn, "transcription_history", "post_processed_text").unwrap()
        );
        assert!(
            check_column_exists(&conn, "transcription_history", "post_process_prompt").unwrap()
        );
    }
}
