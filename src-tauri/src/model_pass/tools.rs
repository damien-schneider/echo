use anyhow::Context;
use log::{debug, error, info};
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use super::command::VoiceCommand;
use crate::managers::tts::TtsManager;
use crate::settings::{self, SoundTheme};

#[derive(Debug, Clone)]
pub(crate) struct ToolResult {
    pub(crate) display_message: String,
    pub(crate) success: bool,
}

pub(super) async fn execute(app: &AppHandle, command: VoiceCommand) -> ToolResult {
    match command {
        VoiceCommand::CycleFeedbackSounds => cycle_feedback_sounds(app),
        VoiceCommand::CreateNote { title, content } => create_note(app, &title, &content),
        VoiceCommand::OpenApplication { app_name } => open_application(app_name).await,
    }
}

/// Only a command's reply is spoken: dictated text already lands where the user reads it.
pub(crate) fn speak_reply(app: &AppHandle, message: &str) {
    if message.is_empty() || !settings::get_settings(app).tts_enabled {
        return;
    }
    let tts = app.state::<Arc<TtsManager>>().inner().clone();
    let message = message.to_string();
    std::thread::spawn(move || {
        if let Err(e) = tts.speak(&message) {
            error!("TTS failed: {e}");
        }
    });
}

/// The custom theme without its files plays nothing at all.
fn next_sound_theme(current: SoundTheme, has_custom_sounds: bool) -> Option<SoundTheme> {
    match current {
        SoundTheme::Marimba if has_custom_sounds => Some(SoundTheme::Custom),
        SoundTheme::Marimba => None,
        SoundTheme::Custom => Some(SoundTheme::Marimba),
    }
}

fn cycle_feedback_sounds(app: &AppHandle) -> ToolResult {
    let current_theme = settings::get_settings(app).sound_theme;
    let has_custom_sounds = crate::commands::audio::has_custom_sounds(app);
    let Some(next_theme) = next_sound_theme(current_theme, has_custom_sounds) else {
        return ToolResult {
            display_message: "Add custom sounds in Settings to switch the sound theme".to_string(),
            success: false,
        };
    };
    settings::update_settings(app, |s| {
        s.sound_theme = next_theme;
    });
    let label = match next_theme {
        SoundTheme::Marimba => "Marimba",
        SoundTheme::Custom => "Custom",
    };
    info!("[Tools] Sound theme changed to {}", label);
    ToolResult {
        display_message: format!("Sound theme changed to {}", label),
        success: true,
    }
}

fn create_note(app: &AppHandle, title: &str, content: &str) -> ToolResult {
    let title: String = title
        .chars()
        .filter(|c| *c != '/' && *c != '\\' && *c != '\0')
        .take(100)
        .collect();
    if title.is_empty() {
        return ToolResult {
            display_message: "Note title cannot be empty".to_string(),
            success: false,
        };
    }
    match save_note(app, &title, content) {
        Ok(path) => {
            info!("[Tools] Note created at {:?}", path);
            ToolResult {
                display_message: format!("Note '{}' created", title),
                success: true,
            }
        }
        Err(error) => {
            error!("[Tools] Failed to create note: {error:#}");
            ToolResult {
                display_message: format!("Failed to create note: {error:#}"),
                success: false,
            }
        }
    }
}

fn save_note(app: &AppHandle, title: &str, content: &str) -> anyhow::Result<PathBuf> {
    let notes_dir = app
        .path()
        .app_data_dir()
        .context("no app data directory")?
        .join("notes");
    std::fs::create_dir_all(&notes_dir).context("notes directory not created")?;
    write_new_note(&notes_dir, title, content)
}

const SAME_TITLE_LIMIT: u32 = 1000;

/// A note already saved under this title holds someone's words: the new one takes a numbered name.
fn write_new_note(notes_dir: &Path, title: &str, content: &str) -> anyhow::Result<PathBuf> {
    for copy in 1..=SAME_TITLE_LIMIT {
        let name = if copy == 1 {
            format!("{title}.txt")
        } else {
            format!("{title} {copy}.txt")
        };
        let path = notes_dir.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut note) => {
                note.write_all(content.as_bytes())?;
                return Ok(path);
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
    }
    anyhow::bail!("too many notes are already named '{title}'")
}

async fn open_application(app_name: String) -> ToolResult {
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

#[cfg(test)]
mod tests {
    use super::{next_sound_theme, write_new_note};
    use crate::settings::SoundTheme;

    #[test]
    fn a_second_note_with_the_same_title_keeps_the_first() -> anyhow::Result<()> {
        let notes_dir = tempfile::tempdir()?;

        let first = write_new_note(notes_dir.path(), "Groceries", "milk")?;
        let second = write_new_note(notes_dir.path(), "Groceries", "bread")?;

        assert_eq!(std::fs::read_to_string(&first)?, "milk");
        assert_eq!(std::fs::read_to_string(&second)?, "bread");
        Ok(())
    }

    #[test]
    fn without_custom_sounds_the_theme_is_not_switched_to_silence() {
        assert_eq!(next_sound_theme(SoundTheme::Marimba, false), None);
    }

    #[test]
    fn the_theme_cycles_between_marimba_and_the_users_own_sounds() {
        assert_eq!(
            next_sound_theme(SoundTheme::Marimba, true),
            Some(SoundTheme::Custom)
        );
        assert_eq!(
            next_sound_theme(SoundTheme::Custom, true),
            Some(SoundTheme::Marimba)
        );
        assert_eq!(
            next_sound_theme(SoundTheme::Custom, false),
            Some(SoundTheme::Marimba)
        );
    }
}
