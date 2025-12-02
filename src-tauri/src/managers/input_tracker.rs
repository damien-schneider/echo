use anyhow::Result;
use rdev::{listen, Event, EventType, Key};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Default timeout duration after which we consider the user has left an input field
/// Value of 0 means disabled (only count on app switch/click)
const DEFAULT_INPUT_IDLE_TIMEOUT_SECS: u64 = 2;

/// Minimum number of characters to trigger saving
const MIN_CHARS_FOR_SAVE: usize = 3;

/// How often to check for idle timeout (milliseconds)
/// Only used for idle timeout checking, not app switching
const IDLE_CHECK_INTERVAL: Duration = Duration::from_millis(500);

/// Events that can be sent through the input tracker channel
#[derive(Debug)]
enum InputTrackerEvent {
    /// App has changed (new app info)
    AppChanged(ActiveAppInfo),
    /// A keystroke was received
    Keystroke(KeystrokeEvent),
    /// Mouse click happened
    Click,
    /// Check for idle timeout
    IdleCheck,
    /// Shutdown the tracker
    Shutdown,
}

#[derive(Debug)]
struct KeystrokeEvent {
    key: Key,
    unicode: Option<String>,
    is_press: bool,
}

/// Information about the currently active application
#[derive(Debug, Clone, Default, PartialEq)]
struct ActiveAppInfo {
    name: String,
    bundle_id: Option<String>,
}

/// Tracks the state of modifier keys
#[derive(Debug, Clone, Default)]
struct ModifierState {
    shift: bool,
    ctrl: bool,
    alt: bool,
    meta: bool, // Cmd on macOS, Win on Windows
}

impl ModifierState {
    fn any_modifier(&self) -> bool {
        self.ctrl || self.alt || self.meta
    }

    fn update(&mut self, key: Key, pressed: bool) {
        match key {
            Key::ShiftLeft | Key::ShiftRight => self.shift = pressed,
            Key::ControlLeft | Key::ControlRight => self.ctrl = pressed,
            Key::Alt | Key::AltGr => self.alt = pressed,
            Key::MetaLeft | Key::MetaRight => self.meta = pressed,
            _ => {}
        }
    }

    fn is_modifier_key(key: Key) -> bool {
        matches!(
            key,
            Key::ShiftLeft
                | Key::ShiftRight
                | Key::ControlLeft
                | Key::ControlRight
                | Key::Alt
                | Key::AltGr
                | Key::MetaLeft
                | Key::MetaRight
        )
    }
}

/// Internal state for tracking typed input
struct InputState {
    buffer: String,
    last_keystroke: Option<Instant>,
    session_start: Option<Instant>,
    current_app: ActiveAppInfo,
    modifiers: ModifierState,
}

impl Default for InputState {
    fn default() -> Self {
        Self {
            buffer: String::new(),
            last_keystroke: None,
            session_start: None,
            current_app: ActiveAppInfo::default(),
            modifiers: ModifierState::default(),
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
    db_path: PathBuf,
    excluded_apps: Arc<RwLock<Vec<String>>>,
    /// Idle timeout in seconds. 0 means disabled (only count on app switch/click)
    idle_timeout_secs: Arc<AtomicU64>,
    /// Channel sender for events
    event_sender: Option<mpsc::Sender<InputTrackerEvent>>,
    /// App handle for emitting Tauri events
    app_handle: Option<AppHandle>,
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
        let idle_timeout = settings
            .input_tracking_idle_timeout
            .unwrap_or(DEFAULT_INPUT_IDLE_TIMEOUT_SECS);

        let manager = Self {
            enabled: Arc::new(AtomicBool::new(false)),
            db_path,
            excluded_apps: Arc::new(RwLock::new(excluded_apps)),
            idle_timeout_secs: Arc::new(AtomicU64::new(idle_timeout)),
            event_sender: None,
            app_handle: Some(app_handle.clone()),
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

    /// Update the idle timeout in seconds. 0 means disabled.
    pub fn set_idle_timeout(&self, timeout_secs: u64) {
        self.idle_timeout_secs.store(timeout_secs, Ordering::SeqCst);
        log::info!(
            "[InputTracker] Updated idle timeout to {} seconds",
            timeout_secs
        );
    }

    /// Check if an app is excluded
    fn is_app_excluded(excluded: &[String], app_info: &ActiveAppInfo) -> bool {
        let by_bundle_id = app_info.bundle_id.as_ref().map_or(false, |id| {
            excluded.iter().any(|e| e.eq_ignore_ascii_case(id))
        });
        let by_name = excluded
            .iter()
            .any(|e| e.eq_ignore_ascii_case(&app_info.name));

        by_bundle_id || by_name
    }

    /// Start the input tracking listener
    pub fn start(&mut self, app_handle: AppHandle) -> Result<()> {
        if self.enabled.load(Ordering::SeqCst) {
            log::warn!("[InputTracker] Already running, skipping start");
            return Ok(());
        }

        log::info!("[InputTracker] Starting input tracker with event-based architecture...");
        self.enabled.store(true, Ordering::SeqCst);
        self.app_handle = Some(app_handle.clone());

        // Create the event channel
        let (tx, rx) = mpsc::channel::<InputTrackerEvent>();
        self.event_sender = Some(tx.clone());

        let db_path = self.db_path.clone();
        let excluded_apps = self.excluded_apps.clone();
        let idle_timeout_secs = self.idle_timeout_secs.clone();

        // Spawn the main event processor thread
        let processor_app_handle = app_handle.clone();
        thread::spawn(move || {
            log::info!("[InputTracker] Event processor thread started");
            let mut state = InputState::default();
            let mut current_app = ActiveAppInfo::default();

            // Get initial app info
            current_app = get_active_app_info_fast();
            state.set_current_app(current_app.clone());
            log::info!(
                "[InputTracker] Initial app: '{}' ({:?})",
                current_app.name,
                current_app.bundle_id
            );

            for event in rx {
                match event {
                    InputTrackerEvent::AppChanged(new_app) => {
                        if new_app != current_app && !current_app.name.is_empty() {
                            log::info!(
                                "[InputTracker] App changed: {} -> {}",
                                current_app.name,
                                new_app.name
                            );

                            // Check if previous app was excluded
                            let prev_excluded = {
                                let excluded = excluded_apps.read().unwrap();
                                Self::is_app_excluded(&excluded, &current_app)
                            };

                            if !prev_excluded {
                                if let Some(entry) = state.take_entry() {
                                    save_entry_to_db(&db_path, &entry, &processor_app_handle);
                                }
                            } else {
                                state.clear();
                            }

                            state.set_current_app(new_app.clone());
                            current_app = new_app;
                        } else if current_app.name.is_empty() {
                            current_app = new_app.clone();
                            state.set_current_app(new_app);
                        }
                    }
                    InputTrackerEvent::Keystroke(keystroke) => {
                        // Check if current app is excluded
                        let is_excluded = {
                            let excluded = excluded_apps.read().unwrap();
                            Self::is_app_excluded(&excluded, &current_app)
                        };

                        if is_excluded {
                            continue;
                        }

                        if keystroke.is_press {
                            state.modifiers.update(keystroke.key, true);

                            if ModifierState::is_modifier_key(keystroke.key) {
                                continue;
                            }

                            let is_submit_key = matches!(
                                keystroke.key,
                                Key::Return | Key::Tab | Key::Escape
                            );
                            let is_save_shortcut = (state.modifiers.meta || state.modifiers.ctrl)
                                && matches!(keystroke.key, Key::KeyS);
                            let is_navigation_shortcut = state.modifiers.meta
                                && matches!(
                                    keystroke.key,
                                    Key::UpArrow | Key::DownArrow | Key::LeftArrow | Key::RightArrow
                                );

                            if is_submit_key || is_save_shortcut {
                                if let Some(entry) = state.take_entry() {
                                    let reason =
                                        if is_save_shortcut { "save shortcut" } else { "submit key" };
                                    log::info!(
                                        "[InputTracker] {} {:?}, saving: '{}'",
                                        reason,
                                        keystroke.key,
                                        entry.content
                                    );
                                    save_entry_to_db(&db_path, &entry, &processor_app_handle);
                                }
                            } else if matches!(keystroke.key, Key::Backspace) {
                                if !state.modifiers.meta && !state.modifiers.ctrl {
                                    state.handle_backspace();
                                } else {
                                    state.clear();
                                }
                            } else if is_navigation_shortcut {
                                if let Some(entry) = state.take_entry() {
                                    log::info!(
                                        "[InputTracker] Navigation shortcut {:?}, saving: '{}'",
                                        keystroke.key,
                                        entry.content
                                    );
                                    save_entry_to_db(&db_path, &entry, &processor_app_handle);
                                }
                            } else if state.modifiers.any_modifier() {
                                state.last_keystroke = Some(Instant::now());
                            } else if let Some(ref unicode) = keystroke.unicode {
                                for c in unicode.chars() {
                                    if c.is_ascii_graphic() || c == ' ' {
                                        state.append_char(c);
                                    }
                                }
                            }
                        } else {
                            state.modifiers.update(keystroke.key, false);
                        }
                    }
                    InputTrackerEvent::Click => {
                        let is_excluded = {
                            let excluded = excluded_apps.read().unwrap();
                            Self::is_app_excluded(&excluded, &current_app)
                        };

                        if !is_excluded {
                            if let Some(entry) = state.take_entry() {
                                log::info!("[InputTracker] Click, saving: '{}'", entry.content);
                                save_entry_to_db(&db_path, &entry, &processor_app_handle);
                            }
                        }

                        // On click, also check if app changed (handles Dock clicks, etc.)
                        let new_app = get_active_app_info_fast();
                        if new_app != current_app {
                            log::info!(
                                "[InputTracker] App changed on click: {} -> {}",
                                current_app.name,
                                new_app.name
                            );
                            state.set_current_app(new_app.clone());
                            current_app = new_app;
                        }
                    }
                    InputTrackerEvent::IdleCheck => {
                        let timeout_secs = idle_timeout_secs.load(Ordering::SeqCst);
                        if timeout_secs > 0 {
                            let is_excluded = {
                                let excluded = excluded_apps.read().unwrap();
                                Self::is_app_excluded(&excluded, &current_app)
                            };

                            if !is_excluded
                                && state.is_idle(Duration::from_secs(timeout_secs))
                                && state.has_content()
                            {
                                if let Some(entry) = state.take_entry() {
                                    log::info!(
                                        "[InputTracker] Idle timeout, saving: '{}'",
                                        entry.content
                                    );
                                    save_entry_to_db(&db_path, &entry, &processor_app_handle);
                                }
                            }
                        }
                    }
                    InputTrackerEvent::Shutdown => {
                        log::info!("[InputTracker] Received shutdown signal");
                        // Save any remaining content
                        if let Some(entry) = state.take_entry() {
                            log::info!(
                                "[InputTracker] Saving remaining on shutdown: '{}'",
                                entry.content
                            );
                            save_entry_to_db(&db_path, &entry, &processor_app_handle);
                        }
                        break;
                    }
                }
            }
            log::info!("[InputTracker] Event processor thread stopped");
        });

        // Spawn the keyboard/mouse listener thread
        let keyboard_tx = tx.clone();
        let keyboard_enabled = self.enabled.clone();
        thread::spawn(move || {
            log::info!("[InputTracker] Keyboard listener thread starting...");

            let callback = move |event: Event| {
                if !keyboard_enabled.load(Ordering::SeqCst) {
                    return;
                }

                match event.event_type {
                    EventType::KeyPress(key) => {
                        let unicode = event.unicode.and_then(|u| {
                            if let Some(name) = u.name {
                                Some(name)
                            } else if !u.unicode.is_empty() {
                                String::from_utf16(&u.unicode).ok()
                            } else {
                                None
                            }
                        });

                        let _ = keyboard_tx.send(InputTrackerEvent::Keystroke(KeystrokeEvent {
                            key,
                            unicode,
                            is_press: true,
                        }));
                    }
                    EventType::KeyRelease(key) => {
                        let _ = keyboard_tx.send(InputTrackerEvent::Keystroke(KeystrokeEvent {
                            key,
                            unicode: None,
                            is_press: false,
                        }));
                    }
                    EventType::ButtonPress(_) => {
                        let _ = keyboard_tx.send(InputTrackerEvent::Click);
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

        // Spawn the idle timeout checker thread
        let idle_tx = tx.clone();
        let idle_enabled = self.enabled.clone();
        thread::spawn(move || {
            log::info!("[InputTracker] Idle checker thread started");
            while idle_enabled.load(Ordering::SeqCst) {
                thread::sleep(IDLE_CHECK_INTERVAL);
                if idle_tx.send(InputTrackerEvent::IdleCheck).is_err() {
                    break;
                }
            }
            log::info!("[InputTracker] Idle checker thread stopped");
        });

        // Spawn the app change watcher thread (fallback polling with longer interval)
        let app_tx = tx.clone();
        let app_enabled = self.enabled.clone();
        thread::spawn(move || {
            log::info!("[InputTracker] App watcher thread started");
            start_app_change_watcher(app_tx, app_enabled);
            log::info!("[InputTracker] App watcher thread stopped");
        });

        log::info!("[InputTracker] Input tracker started successfully");
        Ok(())
    }

    /// Stop the input tracking listener
    pub fn stop(&mut self) {
        log::info!("[InputTracker] Stopping input tracker...");
        self.enabled.store(false, Ordering::SeqCst);

        // Send shutdown event
        if let Some(ref sender) = self.event_sender {
            let _ = sender.send(InputTrackerEvent::Shutdown);
        }
        self.event_sender = None;

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

/// Start watching for app changes using polling with a longer interval
/// App switches are also detected on click events, so this serves as a fallback
/// for keyboard-only app switching (e.g., Cmd+Tab)
fn start_app_change_watcher(tx: mpsc::Sender<InputTrackerEvent>, enabled: Arc<AtomicBool>) {
    // Use a longer poll interval since:
    // 1. Click events already trigger app change detection
    // 2. This is just a fallback for Cmd+Tab style switching
    // 3. Reduces AppleScript overhead significantly
    const APP_POLL_INTERVAL: Duration = Duration::from_millis(2000);

    let mut last_app = get_active_app_info_fast();
    let _ = tx.send(InputTrackerEvent::AppChanged(last_app.clone()));

    while enabled.load(Ordering::SeqCst) {
        thread::sleep(APP_POLL_INTERVAL);

        if !enabled.load(Ordering::SeqCst) {
            break;
        }

        let current_app = get_active_app_info_fast();
        if current_app != last_app {
            log::debug!(
                "[InputTracker] App watcher detected change: {} -> {}",
                last_app.name,
                current_app.name
            );
            if tx
                .send(InputTrackerEvent::AppChanged(current_app.clone()))
                .is_err()
            {
                break;
            }
            last_app = current_app;
        }
    }
}

/// Get information about the currently active (frontmost) application
/// Uses AppleScript to get the displayed name (not process name) and bundle ID
#[cfg(target_os = "macos")]
fn get_active_app_info_fast() -> ActiveAppInfo {
    use std::process::Command;

    // Use "displayed name" instead of "name" to get the proper app name
    // For Electron apps, "name" returns "Electron" but "displayed name" returns "Visual Studio Code"
    // We also get the bundle identifier which is more reliable for identification
    let output = Command::new("osascript")
        .args([
            "-e",
            r#"tell application "System Events"
                set frontApp to first process whose frontmost is true
                set appName to displayed name of frontApp
                set bundleId to bundle identifier of frontApp
                return appName & "|||" & bundleId
            end tell"#,
        ])
        .output();

    match output {
        Ok(output) if output.status.success() => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let parts: Vec<&str> = result.split("|||").collect();

            let name = parts.first().map(|s| s.to_string()).unwrap_or_default();
            let bundle_id = parts.get(1).and_then(|s| {
                let s = s.trim();
                if s.is_empty() || s == "missing value" {
                    None
                } else {
                    Some(s.to_string())
                }
            });

            ActiveAppInfo { name, bundle_id }
        }
        _ => {
            log::debug!("[InputTracker] Failed to get frontmost app info");
            ActiveAppInfo::default()
        }
    }
}

/// Get information about the currently active window on Windows
/// Uses PowerShell to get the foreground window process name
#[cfg(target_os = "windows")]
fn get_active_app_info_fast() -> ActiveAppInfo {
    use std::process::Command;

    // PowerShell script to get the foreground window's process name and path
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            r#"
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                using System.Text;
                public class Win32 {
                    [DllImport("user32.dll")]
                    public static extern IntPtr GetForegroundWindow();
                    [DllImport("user32.dll")]
                    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
                }
"@
            $hwnd = [Win32]::GetForegroundWindow()
            $pid = 0
            [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
            if ($pid -gt 0) {
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($proc) {
                    # Try to get the FileDescription (friendly name) from the executable
                    $desc = ""
                    try {
                        $desc = $proc.MainModule.FileVersionInfo.FileDescription
                    } catch {}
                    if ([string]::IsNullOrWhiteSpace($desc)) {
                        $desc = $proc.ProcessName
                    }
                    Write-Output "$desc|||$($proc.Path)"
                }
            }
            "#,
        ])
        .output();

    match output {
        Ok(output) if output.status.success() => {
            let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let parts: Vec<&str> = result.split("|||").collect();

            let name = parts.first().map(|s| s.to_string()).unwrap_or_default();
            // On Windows, we use the executable path as a pseudo bundle ID
            let bundle_id = parts.get(1).map(|s| s.trim().to_string());

            if name.is_empty() {
                ActiveAppInfo::default()
            } else {
                ActiveAppInfo { name, bundle_id }
            }
        }
        _ => {
            log::debug!("[InputTracker] Failed to get foreground window info");
            ActiveAppInfo::default()
        }
    }
}

/// Get information about the currently active window on Linux
/// Uses xdotool to get the active window information
#[cfg(target_os = "linux")]
fn get_active_app_info_fast() -> ActiveAppInfo {
    use std::process::Command;

    // First try to get the active window ID using xdotool
    let window_id_output = Command::new("xdotool")
        .args(["getactivewindow"])
        .output();

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
            class_str
                .split('"')
                .nth(3)
                .map(|s| s.to_string())
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
        }
    }
}

/// Fallback for unsupported platforms
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn get_active_app_info_fast() -> ActiveAppInfo {
    log::debug!("[InputTracker] Active app detection not supported on this platform");
    ActiveAppInfo::default()
}

/// Save an input entry to the database and emit event to frontend
fn save_entry_to_db(db_path: &PathBuf, entry: &InputEntry, app_handle: &AppHandle) {
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
                log::warn!(
                    "[InputTracker] Creating input_entries table (migration may have been skipped)"
                );
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
                Ok(_) => {
                    log::info!(
                        "[InputTracker] Saved to DB: app={}, len={}",
                        entry.app_name,
                        entry.content.len()
                    );
                    // Emit event to notify frontend
                    if let Err(e) = app_handle.emit("input-entries-updated", ()) {
                        log::warn!("[InputTracker] Failed to emit update event: {}", e);
                    }
                }
                Err(e) => log::error!("[InputTracker] DB save failed: {}", e),
            }
        }
        Err(e) => log::error!("[InputTracker] DB open failed: {}", e),
    }
}

impl Drop for InputTrackerManager {
    fn drop(&mut self) {
        log::info!("[InputTracker] Dropping InputTrackerManager");
        self.stop();
    }
}
