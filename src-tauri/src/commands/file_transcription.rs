use crate::audio_toolkit::audio::decode_audio_file;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::{transcription_timeout, TranscriptionManager};
use log::{error, info};
use rusqlite::params;
use serde::Serialize;
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const INDETERMINATE_PROGRESS: f64 = -1.0;
const MODEL_LOAD_HEADSTART: Duration = Duration::from_millis(500);

#[derive(Clone, Serialize)]
pub struct FileTranscriptionProgress {
    pub status: String,
    pub progress: f64,
    pub message: String,
    #[serde(rename = "fileName")]
    pub file_name: Option<String>,
}

fn is_video_file(path: &PathBuf) -> bool {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    matches!(
        extension.as_str(),
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv"
    )
}

#[tauri::command]
pub async fn transcribe_audio_file(
    app: AppHandle,
    file_path: String,
    history_manager: State<'_, Arc<HistoryManager>>,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
) -> Result<String, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        let err = format!("File not found: {}", file_path);
        emit_error(&app, &err, None);
        return Err(err);
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(ToString::to_string);

    crate::set_file_transcription_active(true);

    let is_video = is_video_file(&path);

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

    // 16 kHz mono f32
    let audio_samples = match decode_audio_file(&path) {
        Ok(samples) => samples,
        Err(e) => {
            let err = if is_video {
                format!(
                    "Failed to extract audio: {}. Make sure FFmpeg is installed.",
                    e
                )
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

    let duration_str = if duration_mins > 0 {
        format!("{}m {}s", duration_mins, duration_secs_remainder)
    } else {
        format!("{}s", duration_secs)
    };

    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "transcribing".to_string(),
            progress: INDETERMINATE_PROGRESS,
            message: format!("Transcribing {} of audio...", duration_str),
            file_name: file_name.clone(),
        },
    );

    transcription_manager.initiate_model_load();
    std::thread::sleep(MODEL_LOAD_HEADSTART);

    let progress_complete = Arc::new(AtomicBool::new(false));
    let progress_complete_clone = progress_complete.clone();
    let app_clone = app.clone();
    let file_name_clone = file_name.clone();
    let duration_str_clone = duration_str.clone();

    let progress_handle = std::thread::spawn(move || {
        let start_time = Instant::now();
        let update_interval = Duration::from_secs(5);

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
                    progress: INDETERMINATE_PROGRESS,
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

    // uncapped, a hung whisper FFI pins `is_file_transcription_active` and blocks dictation forever
    let transcription_result = transcription_manager.transcribe_with_timeout(
        audio_samples.clone(),
        transcription_timeout(audio_samples.len()),
    );

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

    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "saving".to_string(),
            progress: 0.9,
            message: "Saving to history...".to_string(),
            file_name: file_name.clone(),
        },
    );

    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Uploaded File");

    let title = format!("File: {}", file_stem);

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
    }

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("history.db");

    if let Ok(conn) = rusqlite::Connection::open(&db_path) {
        let _ = conn.execute(
            "UPDATE transcription_history SET title = ?1 WHERE id = (SELECT id FROM transcription_history ORDER BY id DESC LIMIT 1)",
            params![title],
        );
    }

    emit_progress(
        &app,
        &FileTranscriptionProgress {
            status: "complete".to_string(),
            progress: 1.0,
            message: "Transcription complete!".to_string(),
            file_name: file_name.clone(),
        },
    );

    crate::set_file_transcription_active(false);

    if let Err(e) = app.emit(
        "transcription-complete",
        json!({
            "text": transcription_text,
            "fileName": file_name.clone().unwrap_or_else(|| "Unknown file".to_string())
        }),
    ) {
        error!("Failed to emit transcription-complete event: {}", e);
    }

    info!(
        "Successfully transcribed audio file: {} ({} characters)",
        file_path,
        transcription_text.len()
    );

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
    crate::set_file_transcription_active(false);

    if let Err(e) = app.emit("file-transcription-error", error_message.to_string()) {
        error!("Failed to emit error event: {}", e);
    }

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
