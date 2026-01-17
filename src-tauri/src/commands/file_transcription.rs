use crate::audio_toolkit::audio::decode_audio_file;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use log::{error, info};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use serde::Serialize;
use serde_json::json;
use rusqlite::params;

#[derive(Clone, Serialize)]
pub struct FileTranscriptionProgress {
    pub status: String,
    pub progress: f64,
    pub message: String,
    #[serde(rename = "fileName")]
    pub file_name: Option<String>,
}

/// Check if a file is a video format
fn is_video_file(path: &PathBuf) -> bool {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    
    matches!(extension.as_str(), "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv")
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
        let err = format!("File not found: {}", file_path);
        emit_error(&app, &err, None);
        return Err(err);
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(ToString::to_string);

    // Mark file transcription as active
    crate::set_file_transcription_active(true);

    let is_video = is_video_file(&path);

    // Emit progress: Starting - different message for video vs audio
    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "decoding".to_string(),
            progress: 0.0,
            message: if is_video {
                "Extracting audio from video...".to_string()
            } else {
                "Loading audio file...".to_string()
            },
            file_name: file_name.clone(),
        },
    );

    // Decode audio file to 16kHz mono f32
    let audio_samples = match decode_audio_file(&path) {
        Ok(samples) => samples,
        Err(e) => {
            let err = if is_video {
                format!("Failed to extract audio: {}. Make sure FFmpeg is installed.", e)
            } else {
                format!("Failed to decode audio: {}", e)
            };
            emit_error(&app, &err, file_name.clone());
            return Err(err);
        }
    };

    if audio_samples.is_empty() {
        let err = "Audio file contains no audible content".to_string();
        emit_error(&app, &err, file_name.clone());
        return Err(err);
    }

    let duration_secs = audio_samples.len() / 16000;
    let duration_mins = duration_secs / 60;
    let duration_secs_remainder = duration_secs % 60;

    // Format duration string
    let duration_str = if duration_mins > 0 {
        format!("{}m {}s", duration_mins, duration_secs_remainder)
    } else {
        format!("{}s", duration_secs)
    };

    // Emit progress: Decoding complete, starting transcription
    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "transcribing".to_string(),
            progress: -1.0, // Indeterminate progress
            message: format!("Transcribing {} of audio...", duration_str),
            file_name: file_name.clone(),
        },
    );

    // Ensure model is loaded
    transcription_manager.initiate_model_load();

    // Wait a moment for model to start loading if it wasn't loaded
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Start elapsed time tracking thread
    let progress_complete = Arc::new(AtomicBool::new(false));
    let progress_complete_clone = progress_complete.clone();
    let app_clone = app.clone();
    let file_name_clone = file_name.clone();
    let duration_str_clone = duration_str.clone();

    // Spawn elapsed time display thread
    let progress_handle = std::thread::spawn(move || {
        let start_time = Instant::now();
        let update_interval = Duration::from_secs(5);

        // Wait a bit before first update
        std::thread::sleep(update_interval);

        while !progress_complete_clone.load(Ordering::SeqCst) {
            let elapsed = start_time.elapsed().as_secs();
            let elapsed_str = if elapsed >= 60 {
                format!("{}m {}s elapsed", elapsed / 60, elapsed % 60)
            } else {
                format!("{}s elapsed", elapsed)
            };

            emit_progress(
                &app_clone,
                &FileTranscriptionProgress {
                    status: "transcribing".to_string(),
                    progress: -1.0, // Indeterminate progress
                    message: format!(
                        "Transcribing {} of audio... ({})",
                        duration_str_clone, elapsed_str
                    ),
                    file_name: file_name_clone.clone(),
                },
            );

            std::thread::sleep(update_interval);
        }
    });

    // Transcribe the audio
    let transcription_result = transcription_manager
        .transcribe(audio_samples.clone());

    // Signal progress thread to stop
    progress_complete.store(true, Ordering::SeqCst);
    let _ = progress_handle.join();

    let transcription_text = match transcription_result {
        Ok(text) => text,
        Err(e) => {
            let err = format!("Transcription failed: {}", e);
            emit_error(&app, &err, file_name.clone());
            return Err(err);
        }
    };

    if transcription_text.trim().is_empty() {
        let err = "No speech detected in the audio".to_string();
        emit_error(&app, &err, file_name.clone());
        return Err(err);
    }

    // Emit progress: Transcription complete, saving
    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "saving".to_string(),
            progress: 0.9,
            message: "Saving to history...".to_string(),
            file_name: file_name.clone(),
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
    if let Err(e) = history_manager
        .save_transcription(
            audio_samples,
            transcription_text.clone(),
            None, // post_processed_text
            None, // post_process_prompt
        )
        .await
    {
        let err = format!("Failed to save to history: {}", e);
        error!("{}", err);
        // Don't return error here, transcription still succeeded
    }

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
            file_name: file_name.clone(),
        },
    );

    // Clear file transcription active flag
    crate::set_file_transcription_active(false);

    // Emit completion event with details for the dialog
    if let Err(e) = app.emit(
        "transcription-complete",
        json!({
            "text": transcription_text,
            "fileName": file_name.clone().unwrap_or_else(|| "Unknown file".to_string())
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

fn emit_error(app: &AppHandle, error_message: &str, file_name: Option<String>) {
    // Clear file transcription active flag
    crate::set_file_transcription_active(false);

    // Emit as file-transcription-error for the listener
    if let Err(e) = app.emit("file-transcription-error", error_message.to_string()) {
        error!("Failed to emit error event: {}", e);
    }

    // Also emit progress with error status so UI updates correctly
    emit_progress(
        app,
        &FileTranscriptionProgress {
            status: "error".to_string(),
            progress: 0.0,
            message: error_message.to_string(),
            file_name,
        },
    );
}
