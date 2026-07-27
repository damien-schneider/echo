#[cfg(target_os = "macos")]
use std::process::Command;

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

/// Battery presence via pmset — laptops have one, desktops do not.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn is_laptop() -> Result<bool, String> {
    let output = Command::new("pmset")
        .arg("-g")
        .arg("batt")
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    Ok(stdout.contains("InternalBattery"))
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn is_clamshell() -> Result<bool, String> {
    Ok(false)
}

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
