use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::actions::{sanitize_dictation_output, FINALIZE_DONE, OPERATION_GENERATION};
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
pub fn execute_open_application(app_name: String) -> ToolResult {
    let app_name = app_name.trim();
    if app_name.is_empty() {
        return ToolResult {
            display_message: "Application name cannot be empty".to_string(),
            success: false,
        };
    }

    debug!("[Tools] Attempting to open application: {}", app_name);

    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("open")
            .arg("-a")
            .arg(app_name)
            .spawn()
        {
            Ok(_) => {
                info!("[Tools] Opened application: {}", app_name);
                return ToolResult {
                    display_message: format!("Opened {}", app_name),
                    success: true,
                };
            }
            Err(e) => {
                error!("[Tools] Failed to open '{}': {}", app_name, e);
                return ToolResult {
                    display_message: format!("Failed to open {}: {}", app_name, e),
                    success: false,
                };
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        match std::process::Command::new("cmd")
            .args(["/C", "start", "", app_name])
            .spawn()
        {
            Ok(_) => {
                info!("[Tools] Opened application: {}", app_name);
                return ToolResult {
                    display_message: format!("Opened {}", app_name),
                    success: true,
                };
            }
            Err(e) => {
                error!("[Tools] Failed to open '{}': {}", app_name, e);
                return ToolResult {
                    display_message: format!("Failed to open {}: {}", app_name, e),
                    success: false,
                };
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let lowercase_name = app_name.to_lowercase();

        if let Ok(_) = std::process::Command::new("gtk-launch")
            .arg(&lowercase_name)
            .spawn()
        {
            info!("[Tools] Opened application via gtk-launch: {}", app_name);
            return ToolResult {
                display_message: format!("Opened {}", app_name),
                success: true,
            };
        }

        if let Ok(_) = std::process::Command::new("xdg-open").arg(app_name).spawn() {
            info!("[Tools] Opened application via xdg-open: {}", app_name);
            return ToolResult {
                display_message: format!("Opened {}", app_name),
                success: true,
            };
        }

        match std::process::Command::new(&lowercase_name).spawn() {
            Ok(_) => {
                info!("[Tools] Opened application via direct exec: {}", app_name);
                ToolResult {
                    display_message: format!("Opened {}", app_name),
                    success: true,
                }
            }
            Err(e) => {
                error!("[Tools] Failed to open '{}': {}", app_name, e);
                ToolResult {
                    display_message: format!("Failed to open {}: {}", app_name, e),
                    success: false,
                }
            }
        }
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
    // stale-skip still counts as handled — the watchdog must not clobber a UI the frontend already answered for
    FINALIZE_DONE.store(op_generation, Ordering::SeqCst);

    // Stashed by the stop flow; the webview never carries the raw buffer. Taken before the stale
    // check so an abandoned generation releases it instead of pinning it until the next dictation.
    let audio_samples = crate::actions::take_pending_audio(op_generation);

    if OPERATION_GENERATION.load(Ordering::SeqCst) != op_generation {
        debug!("finalize_transcription: stale op_generation, skipping");
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
