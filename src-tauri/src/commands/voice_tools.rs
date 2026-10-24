use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::actions::{claim_finalize, sanitize_dictation_output, OPERATION_GENERATION};
use crate::managers::history::HistoryManager;
use crate::managers::tts::TtsManager;
use crate::overlay::show_tool_overlay;
use crate::settings::{self, SoundTheme};
use crate::tray::{change_tray_icon, TrayIconState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub display_message: String,
    pub success: bool,
}

#[tauri::command]
pub fn execute_change_sound_theme(app: AppHandle) -> ToolResult {
    let current_theme = settings::get_settings(&app).sound_theme;
    let next_theme = match current_theme {
        SoundTheme::Marimba => SoundTheme::Pop,
        SoundTheme::Pop => SoundTheme::Custom,
        SoundTheme::Custom => SoundTheme::Marimba,
    };

    settings::update_settings(&app, |s| {
        s.sound_theme = next_theme;
    });

    let label = match next_theme {
        SoundTheme::Marimba => "Marimba",
        SoundTheme::Pop => "Pop",
        SoundTheme::Custom => "Custom",
    };

    info!("[Tools] Sound theme changed to {}", label);
    ToolResult {
        display_message: format!("Sound theme changed to {}", label),
        success: true,
    }
}

#[tauri::command]
pub fn execute_create_note(app: AppHandle, title: String, content: String) -> ToolResult {
    let sanitized_title: String = title
        .chars()
        .filter(|c| *c != '/' && *c != '\\' && *c != '\0')
        .take(100)
        .collect();

    if sanitized_title.is_empty() {
        return ToolResult {
            display_message: "Note title cannot be empty".to_string(),
            success: false,
        };
    }

    let notes_dir: PathBuf = match app.path().app_data_dir() {
        Ok(dir) => dir.join("notes"),
        Err(e) => {
            error!("[Tools] Failed to get app data dir: {}", e);
            return ToolResult {
                display_message: format!("Failed to get app data directory: {}", e),
                success: false,
            };
        }
    };

    if let Err(e) = std::fs::create_dir_all(&notes_dir) {
        error!("[Tools] Failed to create notes dir: {}", e);
        return ToolResult {
            display_message: format!("Failed to create notes directory: {}", e),
            success: false,
        };
    }

    let file_path = notes_dir.join(format!("{}.txt", sanitized_title));
    match std::fs::write(&file_path, &content) {
        Ok(()) => {
            info!("[Tools] Note created at {:?}", file_path);
            ToolResult {
                display_message: format!("Note '{}' created", sanitized_title),
                success: true,
            }
        }
        Err(e) => {
            error!("[Tools] Failed to write note: {}", e);
            ToolResult {
                display_message: format!("Failed to create note: {}", e),
                success: false,
            }
        }
    }
}

#[tauri::command]
pub async fn execute_open_application(app_name: String) -> ToolResult {
    let app_name = app_name.trim().to_string();
    if app_name.is_empty() {
        return ToolResult {
            display_message: "Application name cannot be empty".to_string(),
            success: false,
        };
    }

    debug!("[Tools] Attempting to open application: {}", app_name);
    let launch_name = app_name.clone();
    tauri::async_runtime::spawn_blocking(move || launch_application(&launch_name))
        .await
        .unwrap_or_else(|error| launch_failed(&app_name, &error.to_string()))
}

#[cfg(target_os = "macos")]
fn launch_application(app_name: &str) -> ToolResult {
    let output = std::process::Command::new("open")
        .arg("-a")
        .arg(app_name)
        .output();
    launcher_result(app_name, output)
}

/// Start-Process never raises the blocking "Windows cannot find" dialog that `cmd /C start` does.
#[cfg(target_os = "windows")]
fn launch_application(app_name: &str) -> ToolResult {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Process -FilePath $env:ECHO_APP_NAME -ErrorAction Stop",
        ])
        .env("ECHO_APP_NAME", app_name)
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    launcher_result(app_name, output)
}

/// Null stdio: a launched app inheriting a captured pipe would hold `output()` open until it quits.
#[cfg(target_os = "linux")]
fn launch_application(app_name: &str) -> ToolResult {
    use std::process::{Command, Stdio};
    let desktop_id = app_name.to_lowercase();
    let desktop_launch = Command::new("gtk-launch")
        .arg(&desktop_id)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if matches!(desktop_launch, Ok(status) if status.success()) {
        return launched(app_name);
    }
    match Command::new(&desktop_id).spawn() {
        Ok(_) => launched(app_name),
        Err(error) => {
            error!("[Tools] Could not open '{}': {}", app_name, error);
            not_found(app_name)
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn launcher_result(app_name: &str, output: std::io::Result<std::process::Output>) -> ToolResult {
    match output {
        Ok(output) if output.status.success() => launched(app_name),
        Ok(output) => {
            error!(
                "[Tools] Could not open '{}': {}",
                app_name,
                String::from_utf8_lossy(&output.stderr).trim()
            );
            not_found(app_name)
        }
        Err(error) => launch_failed(app_name, &error.to_string()),
    }
}

fn not_found(app_name: &str) -> ToolResult {
    ToolResult {
        display_message: format!("Couldn't find an app named {}", app_name),
        success: false,
    }
}

fn launched(app_name: &str) -> ToolResult {
    info!("[Tools] Opened application: {}", app_name);
    ToolResult {
        display_message: format!("Opened {}", app_name),
        success: true,
    }
}

fn launch_failed(app_name: &str, reason: &str) -> ToolResult {
    error!("[Tools] Failed to open '{}': {}", app_name, reason);
    ToolResult {
        display_message: format!("Failed to open {}: {}", app_name, reason),
        success: false,
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PostProcessKind {
    Text,
    Tool,
    Empty,
}

#[tauri::command]
pub async fn finalize_transcription(
    app: AppHandle,
    text: String,
    original_transcription: String,
    op_generation: u64,
    kind: PostProcessKind,
    tool_message: Option<String>,
    post_process_prompt: Option<String>,
) -> Result<(), String> {
    let claimed = claim_finalize(op_generation);

    // Stashed by the stop flow; the webview never carries the raw buffer. Taken before the stale
    // check so an abandoned generation releases it instead of pinning it until the next dictation.
    let audio_samples = crate::actions::take_pending_audio(op_generation);

    if !claimed || OPERATION_GENERATION.load(Ordering::SeqCst) != op_generation {
        debug!("finalize_transcription: stale or already delivered op_generation, skipping");
        return Ok(());
    }

    let text = sanitize_dictation_output(&text);
    let original_transcription = sanitize_dictation_output(&original_transcription);

    let hm = app.state::<Arc<HistoryManager>>();
    let tts_manager = app.state::<Arc<TtsManager>>();

    match kind {
        PostProcessKind::Tool => {
            let message = tool_message.unwrap_or_default();

            let hm_clone = Arc::clone(&hm);
            let transcription_for_history = original_transcription.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = hm_clone
                    .save_transcription(audio_samples, transcription_for_history, None, None)
                    .await
                {
                    error!("Failed to save transcription to history: {}", e);
                }
            });

            if OPERATION_GENERATION.load(Ordering::SeqCst) == op_generation {
                show_tool_overlay(&app, &message);
                change_tray_icon(&app, TrayIconState::Idle);
            }
        }
        PostProcessKind::Text => {
            let settings = settings::get_settings(&app);

            if settings.tts_enabled {
                let tts_clone = tts_manager.inner().clone();
                let text_to_speak = text.clone();
                info!("Triggering TTS with text: {}", text_to_speak);
                std::thread::spawn(move || {
                    if let Err(e) = tts_clone.speak(&text_to_speak) {
                        error!("TTS failed: {}", e);
                    }
                });
            }

            let hm_clone = Arc::clone(&hm);
            let transcription_for_history = original_transcription.clone();
            let post_processed = Some(text.clone());
            tauri::async_runtime::spawn(async move {
                if let Err(e) = hm_clone
                    .save_transcription(
                        audio_samples,
                        transcription_for_history,
                        post_processed,
                        post_process_prompt,
                    )
                    .await
                {
                    error!("Failed to save transcription to history: {}", e);
                }
            });

            if OPERATION_GENERATION.load(Ordering::SeqCst) != op_generation {
                debug!("Operation became stale during finalization, skipping paste");
                return Ok(());
            }

            crate::actions::deliver_transcript(&app, text, op_generation);
        }
        PostProcessKind::Empty => {
            let settings = settings::get_settings(&app);

            let hm_clone = Arc::clone(&hm);
            let transcription_for_history = original_transcription.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = hm_clone
                    .save_transcription(audio_samples, transcription_for_history, None, None)
                    .await
                {
                    error!("Failed to save transcription to history: {}", e);
                }
            });

            if OPERATION_GENERATION.load(Ordering::SeqCst) != op_generation {
                debug!("Operation became stale during finalization, skipping paste");
                return Ok(());
            }

            if settings.tts_enabled {
                let tts_clone = tts_manager.inner().clone();
                let text_to_speak = text.clone();
                std::thread::spawn(move || {
                    if let Err(e) = tts_clone.speak(&text_to_speak) {
                        error!("TTS failed: {}", e);
                    }
                });
            }

            crate::actions::deliver_transcript(&app, text, op_generation);
        }
    }

    Ok(())
}
