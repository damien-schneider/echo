//! Shell execution commands for AI SDK tool integration.
//! These commands allow the AI to execute shell operations based on voice commands.

use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdout: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stderr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Opens the default terminal application
#[tauri::command]
pub fn open_terminal(
    app: AppHandle,
    working_directory: Option<String>,
) -> Result<CommandResult, String> {
    let result = if cfg!(target_os = "macos") {
        open_terminal_macos(working_directory)
    } else if cfg!(target_os = "windows") {
        open_terminal_windows(working_directory)
    } else {
        open_terminal_linux(&app, working_directory)
    };

    result.map_err(|e| format!("Failed to open terminal: {}", e))
}

#[cfg(target_os = "macos")]
fn open_terminal_macos(working_directory: Option<String>) -> Result<CommandResult, String> {
    let script = match working_directory {
        Some(ref dir) => format!(
            r#"tell application "Terminal"
                activate
                do script "cd '{}'"
            end tell"#,
            dir.replace("'", "'\\''")
        ),
        None => r#"tell application "Terminal"
            activate
            do script ""
        end tell"#
            .to_string(),
    };

    Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map(|output| CommandResult {
            success: output.status.success(),
            stdout: None,
            stderr: if output.status.success() {
                None
            } else {
                Some(String::from_utf8_lossy(&output.stderr).to_string())
            },
            exit_code: output.status.code(),
            message: Some("Terminal opened".to_string()),
        })
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
fn open_terminal_macos(_working_directory: Option<String>) -> Result<CommandResult, String> {
    Err("macOS terminal not supported on this platform".to_string())
}

#[cfg(target_os = "windows")]
fn open_terminal_windows(working_directory: Option<String>) -> Result<CommandResult, String> {
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "start", "cmd"]);

    if let Some(ref dir) = working_directory {
        cmd.current_dir(dir);
    }

    cmd.spawn()
        .map(|_| CommandResult {
            success: true,
            stdout: None,
            stderr: None,
            exit_code: None,
            message: Some("Terminal opened".to_string()),
        })
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "windows"))]
fn open_terminal_windows(_working_directory: Option<String>) -> Result<CommandResult, String> {
    Err("Windows terminal not supported on this platform".to_string())
}

#[cfg(target_os = "linux")]
fn open_terminal_linux(
    _app: &AppHandle,
    working_directory: Option<String>,
) -> Result<CommandResult, String> {
    // Try common terminal emulators in order of preference
    let terminals = [
        ("gnome-terminal", vec!["--"]),
        ("konsole", vec!["-e"]),
        ("xfce4-terminal", vec!["-e"]),
        ("xterm", vec!["-e"]),
        ("alacritty", vec!["-e"]),
        ("kitty", vec!["--"]),
    ];

    for (terminal, _args) in terminals {
        let mut cmd = Command::new(terminal);

        if let Some(ref dir) = working_directory {
            cmd.current_dir(dir);
        }

        match cmd.spawn() {
            Ok(_) => {
                return Ok(CommandResult {
                    success: true,
                    stdout: None,
                    stderr: None,
                    exit_code: None,
                    message: Some(format!("Opened {}", terminal)),
                });
            }
            Err(_) => continue,
        }
    }

    Err("No supported terminal emulator found".to_string())
}

#[cfg(not(target_os = "linux"))]
fn open_terminal_linux(
    _app: &AppHandle,
    _working_directory: Option<String>,
) -> Result<CommandResult, String> {
    Err("Linux terminal not supported on this platform".to_string())
}

/// Executes a shell command
#[tauri::command]
pub fn execute_shell_command(
    command: String,
    working_directory: Option<String>,
    capture_output: Option<bool>,
) -> Result<CommandResult, String> {
    let capture = capture_output.unwrap_or(false);

    let shell = if cfg!(target_os = "windows") {
        "cmd"
    } else {
        "sh"
    };

    let shell_arg = if cfg!(target_os = "windows") {
        "/C"
    } else {
        "-c"
    };

    let mut cmd = Command::new(shell);
    cmd.args([shell_arg, &command]);

    if let Some(ref dir) = working_directory {
        cmd.current_dir(dir);
    }

    if capture {
        match cmd.output() {
            Ok(output) => Ok(CommandResult {
                success: output.status.success(),
                stdout: Some(String::from_utf8_lossy(&output.stdout).to_string()),
                stderr: Some(String::from_utf8_lossy(&output.stderr).to_string()),
                exit_code: output.status.code(),
                message: None,
            }),
            Err(e) => Err(format!("Failed to execute command: {}", e)),
        }
    } else {
        match cmd.spawn() {
            Ok(mut child) => {
                // Wait for the process to complete
                match child.wait() {
                    Ok(status) => Ok(CommandResult {
                        success: status.success(),
                        stdout: None,
                        stderr: None,
                        exit_code: status.code(),
                        message: Some(if status.success() {
                            "Command executed successfully".to_string()
                        } else {
                            format!("Command exited with code {:?}", status.code())
                        }),
                    }),
                    Err(e) => Err(format!("Failed to wait for command: {}", e)),
                }
            }
            Err(e) => Err(format!("Failed to spawn command: {}", e)),
        }
    }
}

/// Opens a file or URL with the default application
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<CommandResult, String> {
    app.opener()
        .open_path(&path, None::<String>)
        .map(|_| CommandResult {
            success: true,
            stdout: None,
            stderr: None,
            exit_code: None,
            message: Some(format!("Opened: {}", path)),
        })
        .map_err(|e| format!("Failed to open path: {}", e))
}
