use super::*;
use tempfile::TempDir;

fn history_db(dir: &TempDir) -> PathBuf {
    let db_path = dir.path().join("history.db");
    database::initialize_database(&db_path).unwrap();
    db_path
}

fn save(db_path: &Path, recordings_dir: &Path, text: &str) -> i64 {
    let entry = NewEntry {
        timestamp: 1_700_000_000,
        title: "Dictation".into(),
        audio_samples: vec![0.25; 160],
        transcription_text: text.into(),
        post_processed_text: None,
        post_process_prompt: None,
    };
    tauri::async_runtime::block_on(store_entry(db_path, recordings_dir, entry)).unwrap()
}

fn column(db_path: &Path, id: i64, name: &str) -> String {
    connect(db_path)
        .unwrap()
        .query_row(
            &format!("SELECT {name} FROM transcription_history WHERE id = ?1"),
            params![id],
            |row| row.get(0),
        )
        .unwrap()
}

#[test]
fn the_text_is_kept_when_its_recording_cannot_be_written() {
    let dir = TempDir::new().unwrap();
    let db_path = history_db(&dir);
    let not_a_folder = dir.path().join("recordings");
    fs::write(&not_a_folder, b"in the way").unwrap();

    let id = save(&db_path, &not_a_folder, "what was said");

    assert_eq!(column(&db_path, id, "transcription_text"), "what was said");
}

#[test]
fn a_deleted_recordings_folder_is_recreated_by_the_next_save() {
    let dir = TempDir::new().unwrap();
    let db_path = history_db(&dir);
    let recordings_dir = dir.path().join("recordings");

    let id = save(&db_path, &recordings_dir, "after the folder was deleted");

    let file_name = column(&db_path, id, "file_name");
    assert_eq!(
        load_wav_file(recordings_dir.join(file_name)).unwrap().len(),
        160
    );
}

#[test]
fn two_saves_in_the_same_second_keep_separate_recordings() {
    let dir = TempDir::new().unwrap();
    let db_path = history_db(&dir);
    let recordings_dir = dir.path().join("recordings");

    let first = column(
        &db_path,
        save(&db_path, &recordings_dir, "first"),
        "file_name",
    );
    let second = column(
        &db_path,
        save(&db_path, &recordings_dir, "second"),
        "file_name",
    );

    assert_ne!(first, second);
    assert!(recordings_dir.join(first).exists());
    assert!(recordings_dir.join(second).exists());
}

#[test]
fn titling_a_saved_entry_leaves_a_newer_entry_alone() {
    let dir = TempDir::new().unwrap();
    let db_path = history_db(&dir);
    let recordings_dir = dir.path().join("recordings");
    let transcribed_file = save(&db_path, &recordings_dir, "from a file");
    let later_dictation = save(&db_path, &recordings_dir, "dictated meanwhile");

    set_entry_title(&connect(&db_path).unwrap(), transcribed_file, "File: memo").unwrap();

    assert_eq!(column(&db_path, transcribed_file, "title"), "File: memo");
    assert_eq!(column(&db_path, later_dictation, "title"), "Dictation");
}
