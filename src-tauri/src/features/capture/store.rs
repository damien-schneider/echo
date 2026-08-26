use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::managers::database;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct Capture {
    pub(crate) id: i64,
    pub(crate) content: String,
    pub(crate) app_name: Option<String>,
    pub(crate) timestamp: i64,
}

pub(crate) struct CaptureStore {
    db_path: PathBuf,
}

impl CaptureStore {
    pub(crate) fn new(app: &AppHandle) -> Result<Self> {
        let db_path = app.path().app_data_dir()?.join("history.db");
        database::initialize_database(&db_path)
            .context("Failed to initialize the captures database")?;
        Ok(Self { db_path })
    }

    pub(crate) fn save(
        &self,
        content: &str,
        app_name: Option<&str>,
        timestamp: i64,
    ) -> Result<Capture> {
        insert_capture(&self.connection()?, content, app_name, timestamp)
    }

    pub(crate) fn list(&self) -> Result<Vec<Capture>> {
        list_captures(&self.connection()?)
    }

    pub(crate) fn delete(&self, id: i64) -> Result<()> {
        delete_capture(&self.connection()?, id)
    }

    fn connection(&self) -> Result<Connection> {
        open_connection(&self.db_path)
    }
}

fn open_connection(db_path: &Path) -> Result<Connection> {
    Connection::open(db_path)
        .with_context(|| format!("Failed to open the captures database at {db_path:?}"))
}

fn insert_capture(
    conn: &Connection,
    content: &str,
    app_name: Option<&str>,
    timestamp: i64,
) -> Result<Capture> {
    conn.execute(
        "INSERT INTO captures (content, app_name, timestamp) VALUES (?1, ?2, ?3)",
        params![content, app_name, timestamp],
    )
    .context("Failed to save the capture")?;

    Ok(Capture {
        id: conn.last_insert_rowid(),
        content: content.to_string(),
        app_name: app_name.map(str::to_string),
        timestamp,
    })
}

fn list_captures(conn: &Connection) -> Result<Vec<Capture>> {
    let mut statement = conn
        .prepare(
            "SELECT id, content, app_name, timestamp FROM captures ORDER BY timestamp DESC, id DESC",
        )
        .context("Failed to prepare the captures query")?;

    let captures = statement
        .query_map([], |row| {
            Ok(Capture {
                id: row.get(0)?,
                content: row.get(1)?,
                app_name: row.get(2)?,
                timestamp: row.get(3)?,
            })
        })
        .context("Failed to read captures")?
        .collect::<Result<Vec<_>, _>>()
        .context("Failed to read captures")?;

    Ok(captures)
}

fn delete_capture(conn: &Connection, id: i64) -> Result<()> {
    let deleted = conn
        .execute("DELETE FROM captures WHERE id = ?1", params![id])
        .context("Failed to delete the capture")?;
    if deleted == 0 {
        anyhow::bail!("Capture {id} no longer exists");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn database() -> (TempDir, Connection) {
        let directory = TempDir::new().unwrap();
        let db_path = directory.path().join("history.db");
        database::initialize_database(&db_path).unwrap();
        let conn = open_connection(&db_path).unwrap();
        (directory, conn)
    }

    #[test]
    fn lists_the_newest_capture_first() {
        let (_directory, conn) = database();

        insert_capture(&conn, "older", Some("Safari"), 100).unwrap();
        insert_capture(&conn, "newer", None, 200).unwrap();

        let captures = list_captures(&conn).unwrap();
        assert_eq!(
            captures
                .iter()
                .map(|capture| capture.content.as_str())
                .collect::<Vec<_>>(),
            vec!["newer", "older"]
        );
        assert_eq!(captures[1].app_name.as_deref(), Some("Safari"));
    }

    #[test]
    fn deletes_only_the_requested_capture() {
        let (_directory, conn) = database();

        let kept = insert_capture(&conn, "kept", None, 100).unwrap();
        let removed = insert_capture(&conn, "removed", None, 200).unwrap();

        delete_capture(&conn, removed.id).unwrap();

        let captures = list_captures(&conn).unwrap();
        assert_eq!(captures.len(), 1);
        assert_eq!(captures[0].id, kept.id);
    }

    #[test]
    fn refuses_to_delete_a_capture_that_is_gone() {
        let (_directory, conn) = database();

        assert!(delete_capture(&conn, 42).is_err());
    }
}
