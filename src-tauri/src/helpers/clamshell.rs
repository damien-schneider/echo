#[cfg(target_os = "macos")]
use std::process::Command;

/// Determine whether macOS currently reports clamshell (lid-closed) mode.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn is_clamshell() -> Result<bool, String> {
    let output = Command::new("ioreg")
        .args(["-r", "-k", "AppleClamshellState", "-d", "4"])
        .output()
        .map_err(|e| format!("Failed to execute ioreg: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ioreg command failed with status: {}",
            output.status
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.contains("\"AppleClamshellState\" = Yes"))
}

/// Checks if the Mac is a laptop by detecting battery presence
///
/// This uses pmset to check for battery information.
/// Returns true if a battery is detected (laptop), false otherwise (desktop)
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn is_laptop() -> Result<bool, String> {
    let output = Command::new("pmset")
        .arg("-g")
        .arg("batt")
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Check if InternalBattery is present (laptops have batteries, desktops typically don't)
    Ok(stdout.contains("InternalBattery"))
}

/// Stub for non-macOS platforms.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn is_clamshell() -> Result<bool, String> {
    Ok(false)
}

/// Stub implementation for non-macOS platforms
/// Always returns false since laptop detection is macOS-specific
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn is_laptop() -> Result<bool, String> {
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn clamshell_command_executes() {
        let result = is_clamshell();
        assert!(result.is_ok());
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_is_laptop() {
        let result = is_laptop();
        assert!(result.is_ok());
        if let Ok(is_laptop) = result {
            println!("Is laptop: {}", is_laptop);
        }
    }
}
