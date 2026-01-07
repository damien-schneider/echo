use crate::audio_toolkit::audio::decode_audio_file;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use log::{error, info};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use serde::Serialize;
use serde_json::json;
use rusqlite::params;

#[derive(Clone, Serialize)]
pub struct FileTranscriptionProgress {
    pub status: String,
    pub progress: f64,
    pub message: String,
}

#[tauri::command]
pub async fn transcribe_audio_file(
    app: AppHandle,
    file_path: String,
    history_manager: State<'_, Arc<HistoryManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<String, String> {
    let path = PathBuf::from(&file_path);

    // Validate file exists
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    // Emit progress: Starting
    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "decoding".to_string(),
            progress: 0.0,
            message: "Loading audio file...".to_string(),
        },
    );

    // Decode audio file to 16kHz mono f32
    let audio_samples = decode_audio_file(&path)
        .map_err(|e| format!("Failed to decode audio file: {}", e))?;

    if audio_samples.is_empty() {
        return Err("Audio file contains no samples".to_string());
    }

    // Emit progress: Decoding complete, starting transcription
    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "transcribing".to_string(),
            progress: 0.5,
            message: format!(
                "Decoded {} samples ({}s), transcribing...",
                audio_samples.len(),
                audio_samples.len() / 16000
            ),
        },
    );

    // Ensure model is loaded
    transcription_manager.initiate_model_load();

    // Wait a moment for model to start loading if it wasn't loaded
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Transcribe the audio
    let transcription_text = transcription_manager
        .transcribe(audio_samples.clone())
        .map_err(|e| format!("Transcription failed: {}", e))?;

    if transcription_text.trim().is_empty() {
        return Err("Transcription resulted in empty text".to_string());
    }

    // Emit progress: Transcription complete, saving
    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "saving".to_string(),
            progress: 0.9,
            message: "Saving to history...".to_string(),
        },
    );

    // Get file name without extension for title
    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Uploaded File");

    let title = format!("File: {}", file_stem);

    // Save to history with a custom title
    // We need to use save_transcription and then update the title
    history_manager
        .save_transcription(
            audio_samples,
            transcription_text.clone(),
            None, // post_processed_text
            None, // post_process_prompt
        )
        .await
        .map_err(|e| format!("Failed to save to history: {}", e))?;

    // Update the title in the database to use the file name
    // Get the most recent entry and update its title
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("history.db");

    if let Ok(conn) = rusqlite::Connection::open(&db_path) {
        let _ = conn.execute(
            "UPDATE transcription_history SET title = ?1 WHERE id = (SELECT id FROM transcription_history ORDER BY id DESC LIMIT 1)",
            params![title],
        );
    }

    // Emit progress: Complete
    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "complete".to_string(),
            progress: 1.0,
            message: "Transcription complete!".to_string(),
        },
    );

    // Get file name for the completion event
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown file")
        .to_string();

    // Emit completion event with details for the dialog
    if let Err(e) = app.emit(
        "transcription-complete",
        json!({
            "text": transcription_text,
            "fileName": file_name
        })
    ) {
        error!("Failed to emit transcription-complete event: {}", e);
    }

    info!(
        "Successfully transcribed audio file: {} ({} characters)",
        file_path,
        transcription_text.len()
    );

    // Emit event to copy to clipboard
    if let Err(e) = app.emit("copy-to-clipboard", transcription_text.clone()) {
        error!("Failed to emit copy-to-clipboard event: {}", e);
    }

    Ok(transcription_text)
}

fn emit_progress(app: &AppHandle, progress: &FileTranscriptionProgress) {
    if let Err(e) = app.emit("file-transcription-progress", progress) {
        error!("Failed to emit progress event: {}", e);
    }
}
