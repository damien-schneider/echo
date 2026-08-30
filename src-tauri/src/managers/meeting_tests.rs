#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_test_db() -> (TempDir, PathBuf) {
        let temp = TempDir::new().unwrap();
        let db_path = temp.path().join("test.db");
        database::initialize_database(&db_path).unwrap();
        (temp, db_path)
    }

    fn open_conn(db_path: &PathBuf) -> Connection {
        let conn = Connection::open(db_path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn
    }

    fn insert_meeting(conn: &Connection, title: &str, status: &str) -> i64 {
        conn.execute(
            "INSERT INTO meetings (title, start_time, status) VALUES (?1, ?2, ?3)",
            params![title, 1700000000_i64, status],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_segment(
        conn: &Connection,
        meeting_id: i64,
        speaker: &str,
        start_ms: i64,
        end_ms: i64,
        text: &str,
        source: &str,
    ) -> i64 {
        conn.execute(
            "INSERT INTO meeting_segments (meeting_id, speaker_label, start_ms, end_ms, text, confidence, audio_source) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6)",
            params![meeting_id, speaker, start_ms, end_ms, text, source],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            params![name],
            |r| r.get::<_, i64>(0),
        )
        .unwrap()
            > 0
    }

    #[test]
    fn meeting_tables_created_at_init() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        assert!(table_exists(&conn, "meetings"));
        assert!(table_exists(&conn, "meeting_segments"));
    }

    #[test]
    fn insert_and_query_meeting() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let id = insert_meeting(&conn, "Test Meeting", "recording");

        let title: String = conn
            .query_row(
                "SELECT title FROM meetings WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(title, "Test Meeting");
    }

    #[test]
    fn insert_and_query_segments() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let meeting_id = insert_meeting(&conn, "Seg Test", "complete");
        insert_segment(&conn, meeting_id, "Alice", 0, 5000, "Hello there", "mic");
        insert_segment(&conn, meeting_id, "Bob", 5000, 10000, "Hi Alice", "system");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1",
                params![meeting_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn segments_ordered_by_start_ms() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Order Test", "complete");
        insert_segment(&conn, mid, "B", 5000, 10000, "Second", "mic");
        insert_segment(&conn, mid, "A", 0, 5000, "First", "mic");

        let mut stmt = conn
            .prepare(
                "SELECT text FROM meeting_segments WHERE meeting_id = ?1 ORDER BY start_ms ASC",
            )
            .unwrap();
        let texts: Vec<String> = stmt
            .query_map(params![mid], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(texts, vec!["First", "Second"]);
    }

    #[test]
    fn cascade_delete_removes_segments() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Cascade Test", "complete");
        insert_segment(&conn, mid, "X", 0, 1000, "Will be deleted", "mic");

        conn.execute("DELETE FROM meetings WHERE id = ?1", params![mid])
            .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1",
                params![mid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 0,
            "Segments must be cascade-deleted with parent meeting"
        );
    }

    #[test]
    fn rename_speaker_updates_all_matching_segments() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Rename Test", "complete");
        insert_segment(&conn, mid, "Speaker 1", 0, 5000, "Hello", "mic");
        insert_segment(&conn, mid, "Speaker 1", 5000, 10000, "World", "mic");
        insert_segment(&conn, mid, "Speaker 2", 10000, 15000, "Other", "system");

        conn.execute(
            "UPDATE meeting_segments SET speaker_label = ?1 WHERE meeting_id = ?2 AND speaker_label = ?3",
            params!["Alice", mid, "Speaker 1"],
        )
        .unwrap();

        let alice_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1 AND speaker_label = 'Alice'",
                params![mid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(alice_count, 2);

        let sp2_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM meeting_segments WHERE meeting_id = ?1 AND speaker_label = 'Speaker 2'",
                params![mid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(sp2_count, 1);
    }

    #[test]
    fn list_meetings_ordered_by_start_time_desc() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        conn.execute(
            "INSERT INTO meetings (title, start_time, status) VALUES (?1, ?2, ?3)",
            params!["Old Meeting", 1000_i64, "complete"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO meetings (title, start_time, status) VALUES (?1, ?2, ?3)",
            params!["New Meeting", 2000_i64, "complete"],
        )
        .unwrap();

        let mut stmt = conn
            .prepare("SELECT title FROM meetings ORDER BY start_time DESC")
            .unwrap();
        let titles: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(titles, vec!["New Meeting", "Old Meeting"]);
    }

    #[test]
    fn update_meeting_fields() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Update Test", "recording");

        conn.execute(
            "UPDATE meetings SET end_time = ?1, duration_ms = ?2, mic_file_name = ?3, status = ?4 WHERE id = ?5",
            params![1700001000_i64, 60000_i64, "meeting-1-mic.wav", "complete", mid],
        )
        .unwrap();

        let (end_time, duration, mic_file, status): (i64, i64, String, String) = conn
            .query_row(
                "SELECT end_time, duration_ms, mic_file_name, status FROM meetings WHERE id = ?1",
                params![mid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();

        assert_eq!(end_time, 1700001000);
        assert_eq!(duration, 60000);
        assert_eq!(mic_file, "meeting-1-mic.wav");
        assert_eq!(status, "complete");
    }

    #[test]
    fn meeting_summary_update() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let mid = insert_meeting(&conn, "Summary Test", "complete");

        conn.execute(
            "UPDATE meetings SET summary = ?1 WHERE id = ?2",
            params!["This is a summary", mid],
        )
        .unwrap();

        let summary: String = conn
            .query_row(
                "SELECT summary FROM meetings WHERE id = ?1",
                params![mid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(summary, "This is a summary");
    }

    #[test]
    fn foreign_key_constraint_enforced() {
        let (_tmp, db_path) = make_test_db();
        let conn = open_conn(&db_path);

        let result = conn.execute(
            "INSERT INTO meeting_segments (meeting_id, speaker_label, start_ms, end_ms, text, audio_source) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![9999_i64, "X", 0_i64, 1000_i64, "orphan", "mic"],
        );

        assert!(
            result.is_err(),
            "Foreign key constraint should prevent orphan segments"
        );
    }

}
