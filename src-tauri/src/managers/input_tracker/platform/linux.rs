//! Linux-specific application detection using xdotool and GNOME Shell DBus.

use super::ActiveAppInfo;
use std::process::Command;

/// Get information about the currently active window on Linux
/// Uses xdotool for X11 and gdbus for GNOME on Wayland
pub fn get_active_app_info() -> ActiveAppInfo {
    // Check if we're on Wayland
    let is_wayland = std::env::var("XDG_SESSION_TYPE")
        .map(|s| s.to_lowercase() == "wayland")
        .unwrap_or(false);

    if is_wayland {
        // Try GNOME Shell DBus interface for Wayland
        return get_active_app_info_wayland();
    }

    // X11: Use xdotool
    get_active_app_info_x11()
}

fn get_active_app_info_wayland() -> ActiveAppInfo {
    // Try GNOME Shell's Eval interface to get the focused window
    let output = Command::new("gdbus")
        .args([
            "call",
            "--session",
            "--dest",
            "org.gnome.Shell",
            "--object-path",
            "/org/gnome/Shell",
            "--method",
            "org.gnome.Shell.Eval",
            r#"
            const start = Date.now();
            const fw = global.display.get_focus_window();
            if (fw) {
                const app = global.window_tracker.get_window_app(fw);
                const result = {
                    name: app ? app.get_name() : fw.get_title(),
                    id: app ? app.get_id() : '',
                    pid: fw.get_pid()
                };
                JSON.stringify(result);
            } else {
                '{}';
            }
            "#,
        ])
        .output();

    match output {
        Ok(output) if output.status.success() => {
            let result = String::from_utf8_lossy(&output.stdout);
            // gdbus output format: (true, '{"name":"...", "id":"...", "pid":...}')
            // Extract the JSON part
            if let Some(start) = result.find('{') {
                if let Some(end) = result.rfind('}') {
                    let json_str = &result[start..=end];
                    // Simple JSON parsing without serde
                    let name = extract_json_string(json_str, "name").unwrap_or_default();
                    let bundle_id = extract_json_string(json_str, "id");
                    let pid = extract_json_number(json_str, "pid");

                    if !name.is_empty() {
                        return ActiveAppInfo {
                            name,
                            bundle_id,
                            pid,
                        };
                    }
                }
            }
            ActiveAppInfo::default()
        }
        _ => {
            log::debug!("[InputTracker] GNOME Shell DBus not available, falling back to X11");
            // Fall back to XWayland/X11 if available
            get_active_app_info_x11()
        }
    }
}

fn extract_json_string(json: &str, key: &str) -> Option<String> {
    let pattern = format!("\"{}\":\"", key);
    if let Some(start) = json.find(&pattern) {
        let value_start = start + pattern.len();
        if let Some(end) = json[value_start..].find('"') {
            return Some(json[value_start..value_start + end].to_string());
        }
    }
    None
}

fn extract_json_number(json: &str, key: &str) -> Option<i32> {
    let pattern = format!("\"{}\":", key);
    if let Some(start) = json.find(&pattern) {
        let value_start = start + pattern.len();
        let remaining = &json[value_start..];
        let end = remaining
            .find(|c: char| !c.is_ascii_digit() && c != '-')
            .unwrap_or(remaining.len());
        remaining[..end].trim().parse().ok()
    } else {
        None
    }
}

fn get_active_app_info_x11() -> ActiveAppInfo {
    // Get the active window ID using xdotool
    let window_id_output = Command::new("xdotool").args(["getactivewindow"]).output();

    let window_id = match window_id_output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => {
            log::debug!("[InputTracker] xdotool not available or failed");
            return ActiveAppInfo::default();
        }
    };

    if window_id.is_empty() {
        return ActiveAppInfo::default();
    }

    // Get the PID of the window
    let pid_output = Command::new("xdotool")
        .args(["getwindowpid", &window_id])
        .output();

    let pid: Option<i32> = pid_output
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok());

    // Get the window name (title)
    let name_output = Command::new("xdotool")
        .args(["getwindowname", &window_id])
        .output();

    // Get the WM_CLASS which is more reliable for app identification
    let class_output = Command::new("xprop")
        .args(["-id", &window_id, "WM_CLASS"])
        .output();

    let name = match name_output {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => String::new(),
    };

    // Parse WM_CLASS to get the application class name
    // Output format: WM_CLASS(STRING) = "instance", "class"
    let bundle_id = match class_output {
        Ok(output) if output.status.success() => {
            let class_str = String::from_utf8_lossy(&output.stdout);
            // Extract the class name (second quoted string)
            class_str.split('"').nth(3).map(|s| s.to_string())
        }
        _ => None,
    };

    // Use the class name as display name if window title is too long or generic
    let display_name = if let Some(ref class) = bundle_id {
        // Use class name as it's more consistent
        class.clone()
    } else {
        name
    };

    if display_name.is_empty() {
        ActiveAppInfo::default()
    } else {
        ActiveAppInfo {
            name: display_name,
            bundle_id,
            pid,
        }
    }
}
