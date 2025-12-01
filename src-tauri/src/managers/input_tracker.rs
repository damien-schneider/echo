use anyhow::Result;
use rdev::{listen, Event, EventType, Key};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Timeout duration after which we consider the user has left an input field
const INPUT_IDLE_TIMEOUT: Duration = Duration::from_secs(2);

/// Minimum number of characters to trigger saving
const MIN_CHARS_FOR_SAVE: usize = 3;

/// How often to check for app changes (milliseconds)
/// Using 1 second to reduce AppleScript overhead
const APP_CHECK_INTERVAL: Duration = Duration::from_millis(1000);

/// Information about the currently active application
#[derive(Debug, Clone, Default, PartialEq)]
struct ActiveAppInfo {
    name: String,
    bundle_id: Option<String>,
}

/// Internal state for tracking typed input
struct InputState {
    buffer: String,
    last_keystroke: Option<Instant>,
    session_start: Option<Instant>,
    current_app: ActiveAppInfo,
}

impl Default for InputState {
    fn default() -> Self {
        Self {
            buffer: String::new(),
            last_keystroke: None,
            session_start: None,
            current_app: ActiveAppInfo::default(),
        }
    }
}

impl InputState {
    fn append_char(&mut self, c: char) {
        if self.session_start.is_none() {
            self.session_start = Some(Instant::now());
        }
        self.buffer.push(c);
        self.last_keystroke = Some(Instant::now());
        log::debug!(
            "[InputTracker] Buffer: '{}' (len: {})",
            self.buffer,
            self.buffer.len()
        );
    }

    fn handle_backspace(&mut self) {
        self.buffer.pop();
        self.last_keystroke = Some(Instant::now());
    }

    fn clear(&mut self) {
        log::debug!("[InputTracker] Clearing buffer (was: '{}')", self.buffer);
        self.buffer.clear();
        self.last_keystroke = None;
        self.session_start = None;
    }

    fn is_idle(&self, timeout: Duration) -> bool {
        self.last_keystroke
            .map(|t| t.elapsed() >= timeout)
            .unwrap_or(false)
    }

    fn has_content(&self) -> bool {
        self.buffer.trim().len() >= MIN_CHARS_FOR_SAVE
    }

    fn take_entry(&mut self) -> Option<InputEntry> {
        if !self.has_content() {
            self.clear();
            return None;
        }

        let duration_ms = self
            .session_start
            .map(|s| s.elapsed().as_millis() as i64)
            .unwrap_or(0);

        let entry = InputEntry {
            app_name: self.current_app.name.clone(),
            app_bundle_id: self.current_app.bundle_id.clone(),
            content: self.buffer.clone(),
            timestamp: chrono::Utc::now().timestamp(),
            duration_ms,
        };

        self.clear();
        Some(entry)
    }

    fn set_current_app(&mut self, app: ActiveAppInfo) {
        self.current_app = app;
    }
}

/// An entry of tracked input to be saved to the database
#[derive(Debug, Clone)]
struct InputEntry {
    app_name: String,
    app_bundle_id: Option<String>,
    content: String,
    timestamp: i64,
    duration_ms: i64,
}

/// Manager for tracking system-wide input and storing entries
pub struct InputTrackerManager {
    enabled: Arc<AtomicBool>,
    state: Arc<Mutex<InputState>>,
    db_path: PathBuf,
    excluded_apps: Arc<RwLock<Vec<String>>>,
}

impl InputTrackerManager {
    /// Create a new InputTrackerManager
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        log::info!("[InputTracker] Creating new InputTrackerManager");

        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");
        let db_path = app_data_dir.join("echo.db");

        let settings = crate::settings::get_settings(app_handle);
        let excluded_apps = settings.input_tracking_excluded_apps.clone();

        let manager = Self {
            enabled: Arc::new(AtomicBool::new(false)),
            state: Arc::new(Mutex::new(InputState::default())),
            db_path,
            excluded_apps: Arc::new(RwLock::new(excluded_apps)),
        };

        Ok(manager)
    }

    /// Update the list of excluded apps
    pub fn set_excluded_apps(&self, apps: Vec<String>) {
        if let Ok(mut excluded) = self.excluded_apps.write() {
            *excluded = apps;
            log::info!("[InputTracker] Updated excluded apps list");
        }
    }

    /// Check if an app is excluded
    fn is_app_excluded(excluded: &[String], app_info: &ActiveAppInfo) -> bool {
        app_info
            .bundle_id
            .as_ref()
            .map_or(false, |id| excluded.iter().any(|e| e.eq_ignore_ascii_case(id)))
            || excluded
                .iter()
                .any(|e| e.eq_ignore_ascii_case(&app_info.name))
    }

    /// Start the input tracking listener
    pub fn start(&mut self, app_handle: AppHandle) -> Result<()> {
        if self.enabled.load(Ordering::SeqCst) {
            log::warn!("[InputTracker] Already running, skipping start");
            return Ok(());
        }

        log::info!("[InputTracker] Starting input tracker...");
        self.enabled.store(true, Ordering::SeqCst);

        let enabled = self.enabled.clone();
        let state = self.state.clone();
        let db_path = self.db_path.clone();
        let excluded_apps = self.excluded_apps.clone();
        let app = app_handle.clone();

        // Spawn the app monitor and idle checker thread
        let monitor_enabled = self.enabled.clone();
        let monitor_state = self.state.clone();
        let monitor_db_path = self.db_path.clone();
        let monitor_excluded = self.excluded_apps.clone();
        let monitor_app = app_handle.clone();

        thread::spawn(move || {
            log::info!("[InputTracker] App monitor thread started");
            let mut last_app = ActiveAppInfo::default();

            while monitor_enabled.load(Ordering::SeqCst) {
                thread::sleep(APP_CHECK_INTERVAL);

                let current_app = get_active_app_info();

                // Check if app changed
                if current_app != last_app && !last_app.name.is_empty() {
                    log::info!(
                        "[InputTracker] App changed: {} -> {}",
                        last_app.name,
                        current_app.name
                    );

                    // Check if previous app was excluded
                    let prev_excluded = {
                        let excluded = monitor_excluded.read().unwrap();
                        Self::is_app_excluded(&excluded, &last_app)
                    };

                    if !prev_excluded {
                        if let Some(entry) = {
                            let mut state = monitor_state.lock().unwrap();
                            state.take_entry()
                        } {
                            save_entry_to_db(&monitor_db_path, &entry);
                            send_notification(&monitor_app, &entry);
                        }
                    } else {
                        let mut state = monitor_state.lock().unwrap();
                        state.clear();
                    }

                    // Update state with new app
                    {
                        let mut state = monitor_state.lock().unwrap();
                        state.set_current_app(current_app.clone());
                    }

                    last_app = current_app;
                } else if last_app.name.is_empty() {
                    // Initial app detection
                    last_app = current_app.clone();
                    let mut state = monitor_state.lock().unwrap();
                    state.set_current_app(current_app);
                }

                // Check for idle timeout
                let is_excluded = {
                    let excluded = monitor_excluded.read().unwrap();
                    Self::is_app_excluded(&excluded, &last_app)
                };

                if !is_excluded {
                    let should_save = {
                        let state = monitor_state.lock().unwrap();
                        state.is_idle(INPUT_IDLE_TIMEOUT) && state.has_content()
                    };

                    if should_save {
                        if let Some(entry) = {
                            let mut state = monitor_state.lock().unwrap();
                            state.take_entry()
                        } {
                            log::info!("[InputTracker] Idle timeout, saving: '{}'", entry.content);
                            save_entry_to_db(&monitor_db_path, &entry);
                            send_notification(&monitor_app, &entry);
                        }
                    }
                }
            }
            log::info!("[InputTracker] App monitor thread stopped");
        });

        // Spawn the keyboard listener thread
        thread::spawn(move || {
            log::info!("[InputTracker] Keyboard listener thread starting...");

            let callback = move |event: Event| {
                if !enabled.load(Ordering::SeqCst) {
                    return;
                }

                // Check if current app is excluded
                let is_excluded = {
                    let state_guard = state.lock().unwrap();
                    let excluded = excluded_apps.read().unwrap();
                    Self::is_app_excluded(&excluded, &state_guard.current_app)
                };

                if is_excluded {
                    return;
                }

                match event.event_type {
                    EventType::KeyPress(key) => {
                        let mut state_guard = state.lock().unwrap();

                        match key {
                            Key::Return | Key::Tab | Key::Escape => {
                                if let Some(entry) = state_guard.take_entry() {
                                    drop(state_guard);
                                    log::info!(
                                        "[InputTracker] Exit key {:?}, saving: '{}'",
                                        key,
                                        entry.content
                                    );
                                    save_entry_to_db(&db_path, &entry);
                                    send_notification(&app, &entry);
                                }
                            }
                            Key::Backspace => {
                                state_guard.handle_backspace();
                            }
                            _ => {
                                if let Some(ref unicode_info) = event.unicode {
                                    if let Some(ref name) = unicode_info.name {
                                        for c in name.chars() {
                                            if c.is_ascii_graphic() || c == ' ' {
                                                state_guard.append_char(c);
                                            }
                                        }
                                    } else if !unicode_info.unicode.is_empty() {
                                        if let Ok(decoded) =
                                            String::from_utf16(&unicode_info.unicode)
                                        {
                                            for c in decoded.chars() {
                                                if c.is_ascii_graphic() || c == ' ' {
                                                    state_guard.append_char(c);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    EventType::ButtonPress(_) => {
                        let entry = {
                            let mut state_guard = state.lock().unwrap();
                            state_guard.take_entry()
                        };
                        if let Some(entry) = entry {
                            log::info!("[InputTracker] Click, saving: '{}'", entry.content);
                            save_entry_to_db(&db_path, &entry);
                            send_notification(&app, &entry);
                        }
                    }
                    _ => {}
                }
            };

            log::info!("[InputTracker] Starting rdev::listen...");
            if let Err(e) = listen(callback) {
                log::error!("[InputTracker] rdev::listen failed: {:?}", e);
            }
            log::info!("[InputTracker] rdev::listen exited");
        });

        log::info!("[InputTracker] Input tracker started successfully");
        Ok(())
    }

    /// Stop the input tracking listener
    pub fn stop(&mut self) {
        log::info!("[InputTracker] Stopping input tracker...");
        self.enabled.store(false, Ordering::SeqCst);

        if let Ok(mut state) = self.state.lock() {
            state.clear();
        }

        log::info!("[InputTracker] Input tracker stopped");
    }

    /// Check if tracking is currently enabled
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// Enable or disable tracking
    pub fn set_enabled(&mut self, enabled: bool, app_handle: &AppHandle) {
        log::info!("[InputTracker] set_enabled called with: {}", enabled);
        if enabled && !self.is_enabled() {
            if let Err(e) = self.start(app_handle.clone()) {
                log::error!("[InputTracker] Failed to start: {}", e);
            }
        } else if !enabled && self.is_enabled() {
            self.stop();
        }
    }
}

/// Get information about the currently active (frontmost) application
/// Uses a cached AppleScript approach for better performance
#[cfg(target_os = "macos")]
fn get_active_app_info() -> ActiveAppInfo {
    use std::process::Command;

    // Simplified script that's faster to execute
    let output = Command::new("osascript")
        .args(["-e", "tell application \"System Events\" to get {name, bundle identifier} of first application process whose frontmost is true"])
        .output();

    match output {
        Ok(output) if output.status.success() => {
            let result = String::from_utf8_lossy(&output.stdout);
            // Output format: "AppName, com.bundle.id"
            let trimmed = result.trim();
            if let Some(comma_pos) = trimmed.find(", ") {
                let name = trimmed[..comma_pos].to_string();
                let bundle_id = trimmed[comma_pos + 2..].to_string();
                return ActiveAppInfo {
                    name,
                    bundle_id: Some(bundle_id),
                };
            }
            ActiveAppInfo::default()
        }
        _ => ActiveAppInfo::default(),
    }
}

#[cfg(not(target_os = "macos"))]
fn get_active_app_info() -> ActiveAppInfo {
    ActiveAppInfo::default()
}

/// Save an input entry to the database
fn save_entry_to_db(db_path: &PathBuf, entry: &InputEntry) {
    match Connection::open(db_path) {
        Ok(conn) => {
            // Ensure table exists (handles migration edge cases)
            let table_exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='input_entries'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !table_exists {
                log::warn!("[InputTracker] Creating input_entries table (migration may have been skipped)");
                if let Err(e) = conn.execute_batch(
                    "CREATE TABLE IF NOT EXISTS input_entries (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        app_name TEXT NOT NULL,
                        app_bundle_id TEXT,
                        window_title TEXT,
                        content TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        duration_ms INTEGER DEFAULT 0
                    );
                    CREATE INDEX IF NOT EXISTS idx_input_entries_timestamp ON input_entries(timestamp);
                    CREATE INDEX IF NOT EXISTS idx_input_entries_app ON input_entries(app_bundle_id)",
                ) {
                    log::error!("[InputTracker] Failed to create table: {}", e);
                    return;
                }
            }

            let result = conn.execute(
                "INSERT INTO input_entries (app_name, app_bundle_id, window_title, content, timestamp, duration_ms) 
                 VALUES (?1, ?2, NULL, ?3, ?4, ?5)",
                (
                    &entry.app_name,
                    &entry.app_bundle_id,
                    &entry.content,
                    entry.timestamp,
                    entry.duration_ms,
                ),
            );

            match result {
                Ok(_) => log::info!(
                    "[InputTracker] Saved to DB: app={}, len={}",
                    entry.app_name,
                    entry.content.len()
                ),
                Err(e) => log::error!("[InputTracker] DB save failed: {}", e),
            }
        }
        Err(e) => log::error!("[InputTracker] DB open failed: {}", e),
    }
}

/// Send a notification with the captured input text
fn send_notification(app: &AppHandle, entry: &InputEntry) {
    let truncated = if entry.content.len() > 100 {
        format!("{}...", &entry.content[..100])
    } else {
        entry.content.clone()
    };

    let title = format!("Input from {}", entry.app_name);

    match app
        .notification()
        .builder()
        .title(&title)
        .body(&truncated)
        .show()
    {
        Ok(_) => log::debug!("[InputTracker] Notification sent"),
        Err(e) => log::error!("[InputTracker] Notification failed: {}", e),
    }
}

impl Drop for InputTrackerManager {
    fn drop(&mut self) {
        log::info!("[InputTracker] Dropping InputTrackerManager");
        self.stop();
    }
}
