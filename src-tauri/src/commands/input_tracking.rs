use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct InputEntry {
    pub id: i64,
    pub app_name: String,
    pub app_bundle_id: Option<String>,
    pub app_pid: Option<i32>,
    pub window_title: Option<String>,
    pub content: String,
    pub timestamp: i64,
    pub duration_ms: i64,
}

#[tauri::command]
pub fn get_input_entries(app: AppHandle, limit: Option<usize>) -> Result<Vec<InputEntry>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let db_path = app_data_dir.join("echo.db");

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    let limit_clause = limit.map(|l| format!(" LIMIT {}", l)).unwrap_or_default();
    let query = format!(
        "SELECT id, app_name, app_bundle_id, app_pid, window_title, content, timestamp, duration_ms 
         FROM input_entries ORDER BY timestamp DESC{}",
        limit_clause
    );

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let entries = stmt
        .query_map([], |row| {
            Ok(InputEntry {
                id: row.get(0)?,
                app_name: row.get(1)?,
                app_bundle_id: row.get(2)?,
                app_pid: row.get(3)?,
                window_title: row.get(4)?,
                content: row.get(5)?,
                timestamp: row.get(6)?,
                duration_ms: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query entries: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn delete_input_entry(app: AppHandle, id: i64) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let db_path = app_data_dir.join("echo.db");

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    conn.execute("DELETE FROM input_entries WHERE id = ?1", [id])
        .map_err(|e| format!("Failed to delete entry: {}", e))?;

    log::info!("Deleted input entry with id: {}", id);
    Ok(())
}

#[tauri::command]
pub fn clear_all_input_entries(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let db_path = app_data_dir.join("echo.db");

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    let deleted = conn
        .execute("DELETE FROM input_entries", [])
        .map_err(|e| format!("Failed to clear entries: {}", e))?;

    log::info!("Cleared {} input entries", deleted);
    Ok(())
}

#[tauri::command]
pub async fn get_installed_apps() -> Vec<(String, String)> {
    // Run in blocking task to not freeze the UI
    tokio::task::spawn_blocking(get_apps_impl)
        .await
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn get_apps_impl() -> Vec<(String, String)> {
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    let mut apps = Vec::new();

    // 1. Get currently running apps (fast, single-line AppleScript)
    let output = Command::new("osascript")
        .args(["-e", "tell application \"System Events\" to get {name, bundle identifier} of every application process whose bundle identifier is not missing value"])
        .output();

    if let Ok(output) = output {
        if output.status.success() {
            let result = String::from_utf8_lossy(&output.stdout);
            // Output format: "name1, name2, ..., bundleId1, bundleId2, ..."
            let trimmed = result.trim();
            // Parse the two lists separated by the middle
            if let Some((names_part, ids_part)) = parse_applescript_lists(trimmed) {
                for (name, bundle_id) in names_part.iter().zip(ids_part.iter()) {
                    if !name.is_empty() && !bundle_id.is_empty() {
                        apps.push((name.clone(), bundle_id.clone()));
                    }
                }
            }
        }
    }

    // 2. Scan /Applications folder for installed apps
    let applications_dir = Path::new("/Applications");
    if let Ok(entries) = fs::read_dir(applications_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "app") {
                if let Some(app_info) = get_app_info_from_bundle(&path) {
                    if !apps.iter().any(|(_, b)| b == &app_info.1) {
                        apps.push(app_info);
                    }
                }
            }
        }
    }

    // 3. Add common apps that might be in other locations
    let common_apps = [
        ("Visual Studio Code", "com.microsoft.VSCode"),
        ("Cursor", "com.todesktop.230313mzl4w4u92"),
        ("Safari", "com.apple.Safari"),
        ("Google Chrome", "com.google.Chrome"),
        ("Firefox", "org.mozilla.firefox"),
        ("Slack", "com.tinyspeck.slackmacgap"),
        ("Discord", "com.discord"),
        ("Notion", "notion.id"),
        ("Terminal", "com.apple.Terminal"),
        ("iTerm2", "com.googlecode.iterm2"),
        ("1Password", "com.1password.1password"),
        ("Bitwarden", "com.bitwarden.desktop"),
    ];

    for (name, bundle_id) in common_apps {
        if !apps.iter().any(|(_, b)| b == bundle_id) {
            apps.push((name.to_string(), bundle_id.to_string()));
        }
    }

    apps.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
    apps.dedup_by(|a, b| a.1 == b.1);
    apps
}

#[cfg(target_os = "macos")]
fn parse_applescript_lists(input: &str) -> Option<(Vec<String>, Vec<String>)> {
    // AppleScript returns: "name1, name2, ..., id1, id2, ..."
    // We need to split this into two equal halves
    let items: Vec<&str> = input.split(", ").collect();
    if items.len() < 2 || items.len() % 2 != 0 {
        return None;
    }

    let mid = items.len() / 2;
    let names: Vec<String> = items[..mid].iter().map(|s| s.to_string()).collect();
    let ids: Vec<String> = items[mid..].iter().map(|s| s.to_string()).collect();

    Some((names, ids))
}

#[cfg(target_os = "macos")]
fn get_app_info_from_bundle(path: &std::path::Path) -> Option<(String, String)> {
    use std::process::Command;

    // Use defaults to read the Info.plist
    let plist_path = path.join("Contents/Info.plist");
    if !plist_path.exists() {
        return None;
    }

    let bundle_id = Command::new("defaults")
        .args(["read", plist_path.to_str()?, "CFBundleIdentifier"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())?;

    let name = Command::new("defaults")
        .args(["read", plist_path.to_str()?, "CFBundleName"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .or_else(|| {
            // Fallback to filename without .app extension
            path.file_stem()?.to_str().map(|s| s.to_string())
        })?;

    if bundle_id.is_empty() {
        return None;
    }

    Some((name, bundle_id))
}

#[cfg(not(target_os = "macos"))]
fn get_apps_impl() -> Vec<(String, String)> {
    Vec::new()
}
