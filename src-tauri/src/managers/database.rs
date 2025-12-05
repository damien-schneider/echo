//! Database initialization and migration management.
//!
//! This module provides a clean, self-managed SQLite database initialization system
//! using rusqlite directly. It handles schema creation and versioned migrations
//! with proper transaction support.
//!
//! # Architecture
//!
//! - Migrations are defined as versioned SQL statements
//! - Schema version is tracked in a `schema_version` table
//! - All migrations run within a transaction for atomicity
//! - Operations assume valid schema after initialization (fail-fast on errors)

use anyhow::{Context, Result};
use log::{debug, info};
use rusqlite::Connection;
use std::path::Path;

/// Current schema version. Increment this when adding new migrations.
const CURRENT_SCHEMA_VERSION: u32 = 5;

/// A database migration with version and SQL statement.
struct Migration {
    version: u32,
    description: &'static str,
    sql: &'static str,
}

/// All migrations for the history database, in order.
/// Each migration should be idempotent where possible (using IF NOT EXISTS, etc.)
/// but the migration runner ensures each only runs once.
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
];

/// Initialize the database at the given path, creating schema and running migrations.
///
/// This function is idempotent - it can be called multiple times safely.
/// It will:
/// 1. Create the database file if it doesn't exist
/// 2. Create the schema_version table if needed
/// 3. Run any pending migrations in order
/// 4. Verify the schema is at the expected version
///
/// # Errors
///
/// Returns an error if:
/// - Database file cannot be created or opened
/// - Any migration fails (entire transaction is rolled back)
/// - Schema version is higher than expected (indicates newer app version was used)
pub fn initialize_database(db_path: &Path) -> Result<()> {
    let conn = Connection::open(db_path)
        .with_context(|| format!("Failed to open database at {:?}", db_path))?;

    // Enable foreign keys and WAL mode for better performance
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;",
    )
    .context("Failed to set database pragmas")?;

    // Check for legacy sqlx migrations table (from tauri-plugin-sql)
    let has_sqlx_migrations = check_table_exists(&conn, "_sqlx_migrations")?;
    let has_schema_version = check_table_exists(&conn, "schema_version")?;
    let has_history_table = check_table_exists(&conn, "transcription_history")?;

    if has_sqlx_migrations && !has_schema_version {
        // Database was previously managed by tauri-plugin-sql
        // Migrate to our schema version tracking
        migrate_from_sqlx(&conn)?;
    } else if !has_schema_version {
        // Fresh database or legacy database without version tracking
        create_schema_version_table(&conn)?;

        if has_history_table {
            // Existing database without version tracking - detect current state
            let detected_version = detect_schema_version(&conn)?;
            set_schema_version(&conn, detected_version)?;
            info!(
                "Detected existing database at schema version {}",
                detected_version
            );
        }
    }

    // Run pending migrations
    run_migrations(&conn)?;

    let final_version = get_schema_version(&conn)?;
    debug!(
        "Database initialized at {:?}, schema version: {}",
        db_path, final_version
    );

    Ok(())
}

/// Check if a table exists in the database.
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

/// Check if a column exists in a table.
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

/// Create the schema_version table.
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

    // Initialize with version 0 (no migrations applied yet)
    conn.execute(
        "INSERT INTO schema_version (id, version, updated_at) VALUES (1, 0, strftime('%s', 'now'))",
        [],
    )
    .context("Failed to initialize schema version")?;

    debug!("Created schema_version table");
    Ok(())
}

/// Get the current schema version.
fn get_schema_version(conn: &Connection) -> Result<u32> {
    let version: u32 = conn
        .query_row("SELECT version FROM schema_version WHERE id = 1", [], |row| {
            row.get(0)
        })
        .context("Failed to read schema version")?;

    Ok(version)
}

/// Set the schema version.
fn set_schema_version(conn: &Connection, version: u32) -> Result<()> {
    conn.execute(
        "UPDATE schema_version SET version = ?1, updated_at = strftime('%s', 'now') WHERE id = 1",
        [version],
    )
    .context("Failed to update schema version")?;

    Ok(())
}

/// Detect the current schema version by inspecting table structure.
/// Used for databases that exist but don't have version tracking.
fn detect_schema_version(conn: &Connection) -> Result<u32> {
    if !check_table_exists(conn, "transcription_history")? {
        return Ok(0);
    }

    // Check for tables/columns added in later migrations
    let has_input_entries = check_table_exists(conn, "input_entries")?;
    let has_app_pid = check_column_exists(conn, "input_entries", "app_pid")?;
    let has_post_process_prompt =
        check_column_exists(conn, "transcription_history", "post_process_prompt")?;
    let has_post_processed_text =
        check_column_exists(conn, "transcription_history", "post_processed_text")?;

    if has_input_entries && has_app_pid {
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

/// Migrate from tauri-plugin-sql's sqlx migration tracking.
fn migrate_from_sqlx(conn: &Connection) -> Result<()> {
    info!("Migrating from tauri-plugin-sql to native schema management");

    // Create our schema_version table
    create_schema_version_table(conn)?;

    // Detect current version from sqlx migrations or table structure
    let detected_version = detect_schema_version(conn)?;
    set_schema_version(conn, detected_version)?;

    // Optionally drop the sqlx migrations table (keep for safety/debugging)
    // conn.execute("DROP TABLE IF EXISTS _sqlx_migrations", [])?;

    info!(
        "Migrated from sqlx, detected schema version: {}",
        detected_version
    );
    Ok(())
}

/// Run all pending migrations.
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
        debug!("Database schema is up to date (version {})", current_version);
        return Ok(());
    }

    info!(
        "Running migrations from version {} to {}",
        current_version, CURRENT_SCHEMA_VERSION
    );

    // Run each pending migration in a transaction
    for migration in MIGRATIONS.iter() {
        if migration.version <= current_version {
            continue;
        }

        debug!(
            "Applying migration {}: {}",
            migration.version, migration.description
        );

        // Use a savepoint for each migration so we can provide better error context
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

        // Verify table exists with all columns
        assert!(check_table_exists(&conn, "transcription_history").unwrap());
        assert!(check_column_exists(&conn, "transcription_history", "post_processed_text").unwrap());
        assert!(check_column_exists(&conn, "transcription_history", "post_process_prompt").unwrap());
    }

    #[test]
    fn test_idempotent_initialization() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        // Initialize twice
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

        // Create a database manually at version 1
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

        // Initialize should detect version 1 and migrate to current
        initialize_database(&db_path).unwrap();

        let conn = Connection::open(&db_path).unwrap();
        let version = get_schema_version(&conn).unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);

        // Verify new columns exist
        assert!(check_column_exists(&conn, "transcription_history", "post_processed_text").unwrap());
        assert!(check_column_exists(&conn, "transcription_history", "post_process_prompt").unwrap());
    }
}
