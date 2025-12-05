//! Input Tracker Module
//!
//! This module provides system-wide input tracking functionality for the Echo application.
//! It monitors keyboard and mouse events, tracks the active application, and persists
//! typed content to the database for later analysis.
//!
//! ## Architecture
//!
//! The module is organized into several sub-modules:
//!
//! - `types` - Core data types (ActiveAppInfo, InputEntry, events)
//! - `state` - Input state management (buffer, cursor, modifiers)
//! - `platform` - OS-specific application detection
//! - `database` - Database persistence operations
//!
//! ## Event-based Architecture
//!
//! The tracker uses an event-based architecture with separate threads for:
//! - Keyboard/mouse event capture (rdev)
//! - App change detection (polling with native APIs)
//! - Idle timeout checking
//! - Event processing and database persistence

mod database;
mod platform;
mod state;
mod types;

use anyhow::Result;
use rdev::{listen, Event, EventType, Key};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, RwLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use database::save_entry_to_db;
use platform::get_active_app_info_fast;
use state::{InputState, ModifierState};
use types::{ActiveAppInfo, InputTrackerEvent, KeystrokeEvent};

// Re-export the manager for external use (currently unused but may be needed by other modules)

/// Default timeout duration after which we consider the user has left an input field
/// Value of 0 means disabled (only count on app switch/click)
const DEFAULT_INPUT_IDLE_TIMEOUT_SECS: u64 = 2;

/// How often to check for idle timeout (milliseconds)
/// Only used for idle timeout checking, not app switching
const IDLE_CHECK_INTERVAL: Duration = Duration::from_millis(500);

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

            // Get initial app info
            let mut current_app = get_active_app_info_fast();
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

                            // --- Buffer-invalidating operations ---
                            // These operations make our cursor tracking unreliable, so save and clear

                            // Selection (Shift + Arrow keys) invalidates cursor tracking
                            let is_selection = state.modifiers.shift
                                && matches!(
                                    keystroke.key,
                                    Key::LeftArrow
                                        | Key::RightArrow
                                        | Key::UpArrow
                                        | Key::DownArrow
                                        | Key::Home
                                        | Key::End
                                );

                            // Clipboard operations (Cmd/Ctrl + C/X/V/A)
                            let is_clipboard_op = (state.modifiers.meta || state.modifiers.ctrl)
                                && matches!(
                                    keystroke.key,
                                    Key::KeyC | Key::KeyX | Key::KeyV | Key::KeyA
                                );

                            // Undo/Redo (Cmd/Ctrl + Z, Cmd/Ctrl + Shift + Z, Cmd/Ctrl + Y)
                            let is_undo_redo = (state.modifiers.meta || state.modifiers.ctrl)
                                && matches!(keystroke.key, Key::KeyZ | Key::KeyY);

                            // Vertical navigation (Up/Down arrows without word modifier)
                            // These move between lines which we can't track
                            let is_vertical_nav = !state.modifiers.shift
                                && matches!(keystroke.key, Key::UpArrow | Key::DownArrow);

                            // Large jumps (PageUp/PageDown, Cmd+Up/Down for document start/end)
                            let is_large_jump = matches!(keystroke.key, Key::PageUp | Key::PageDown)
                                || (state.modifiers.is_line_modifier()
                                    && matches!(keystroke.key, Key::UpArrow | Key::DownArrow));

                            // Submit keys (Return, Tab, Escape)
                            let is_submit_key =
                                matches!(keystroke.key, Key::Return | Key::Tab | Key::Escape);

                            // Save shortcut (Cmd/Ctrl + S)
                            let is_save_shortcut = (state.modifiers.meta || state.modifiers.ctrl)
                                && matches!(keystroke.key, Key::KeyS);

                            if is_selection || is_clipboard_op || is_undo_redo || is_large_jump {
                                // Save buffer and clear - these operations invalidate our tracking
                                if let Some(entry) = state.take_entry() {
                                    log::info!(
                                        "[InputTracker] Buffer-invalidating op {:?}, saving: '{}'",
                                        keystroke.key,
                                        entry.content
                                    );
                                    save_entry_to_db(&db_path, &entry, &processor_app_handle);
                                }
                            } else if is_vertical_nav {
                                // Vertical navigation without modifiers - save and clear
                                if let Some(entry) = state.take_entry() {
                                    log::info!(
                                        "[InputTracker] Vertical nav {:?}, saving: '{}'",
                                        keystroke.key,
                                        entry.content
                                    );
                                    save_entry_to_db(&db_path, &entry, &processor_app_handle);
                                }
                            } else if is_submit_key || is_save_shortcut {
                                if let Some(entry) = state.take_entry() {
                                    let reason = if is_save_shortcut {
                                        "save shortcut"
                                    } else {
                                        "submit key"
                                    };
                                    log::info!(
                                        "[InputTracker] {} {:?}, saving: '{}'",
                                        reason,
                                        keystroke.key,
                                        entry.content
                                    );
                                    save_entry_to_db(&db_path, &entry, &processor_app_handle);
                                }
                            }
                            // --- Cursor movement operations ---
                            else if matches!(keystroke.key, Key::LeftArrow) {
                                if state.modifiers.is_line_modifier() {
                                    // Cmd+Left on macOS: move to start of line
                                    state.move_cursor_to_start();
                                } else if state.modifiers.is_word_modifier() {
                                    // Option+Left on macOS, Ctrl+Left on Win/Linux: word jump
                                    state.move_cursor_word_left();
                                } else {
                                    // Plain left arrow: single character
                                    state.move_cursor_left();
                                }
                            } else if matches!(keystroke.key, Key::RightArrow) {
                                if state.modifiers.is_line_modifier() {
                                    // Cmd+Right on macOS: move to end of line
                                    state.move_cursor_to_end();
                                } else if state.modifiers.is_word_modifier() {
                                    // Option+Right on macOS, Ctrl+Right on Win/Linux: word jump
                                    state.move_cursor_word_right();
                                } else {
                                    // Plain right arrow: single character
                                    state.move_cursor_right();
                                }
                            } else if matches!(keystroke.key, Key::Home) {
                                state.move_cursor_to_start();
                            } else if matches!(keystroke.key, Key::End) {
                                state.move_cursor_to_end();
                            }
                            // --- Deletion operations ---
                            else if matches!(keystroke.key, Key::Backspace) {
                                if state.modifiers.meta || state.modifiers.ctrl {
                                    // Cmd/Ctrl+Backspace: delete word or line - clear buffer
                                    state.clear();
                                } else if state.modifiers.is_word_modifier() {
                                    // Option+Backspace on macOS: delete word
                                    // We can't accurately track this, so clear
                                    state.clear();
                                } else {
                                    state.handle_backspace();
                                }
                            } else if matches!(keystroke.key, Key::Delete) {
                                if state.modifiers.meta
                                    || state.modifiers.ctrl
                                    || state.modifiers.is_word_modifier()
                                {
                                    // Modified delete: clear buffer
                                    state.clear();
                                } else {
                                    state.handle_delete();
                                }
                            }
                            // --- Character input ---
                            else if !state.modifiers.any_modifier() {
                                if let Some(ref unicode) = keystroke.unicode {
                                    for c in unicode.chars() {
                                        if c.is_ascii_graphic() || c == ' ' {
                                            state.append_char(c);
                                        }
                                    }
                                }
                            } else {
                                // Some other modifier combination - just update last keystroke
                                state.last_keystroke = Some(std::time::Instant::now());
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

/// Start watching for app changes using polling with reduced interval
/// On macOS, we use a shorter interval since native APIs are fast
/// On other platforms, we use polling as the primary mechanism
#[cfg(target_os = "macos")]
fn start_app_change_watcher(tx: mpsc::Sender<InputTrackerEvent>, enabled: Arc<AtomicBool>) {
    // Use a very short poll interval on macOS since native APIs are extremely fast (~1ms)
    // This provides reliable detection for keyboard-only app switching (Cmd+Tab, Spotlight, Raycast)
    const APP_POLL_INTERVAL: Duration = Duration::from_millis(50);

    let mut last_app = get_active_app_info_fast();
    log::info!(
        "[InputTracker] App watcher started, initial app: {} (pid: {:?}, bundle: {:?})",
        last_app.name,
        last_app.pid,
        last_app.bundle_id
    );
    let _ = tx.send(InputTrackerEvent::AppChanged(last_app.clone()));

    while enabled.load(Ordering::SeqCst) {
        thread::sleep(APP_POLL_INTERVAL);

        if !enabled.load(Ordering::SeqCst) {
            break;
        }

        let current_app = get_active_app_info_fast();

        // Always compare by PID - this is the most reliable way to detect app changes
        // PID uniquely identifies a process, so different apps will always have different PIDs
        let app_changed = current_app.pid != last_app.pid;

        if app_changed {
            log::info!(
                "[InputTracker] App change detected: {} (pid: {:?}) -> {} (pid: {:?})",
                last_app.name,
                last_app.pid,
                current_app.name,
                current_app.pid
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

#[cfg(not(target_os = "macos"))]
fn start_app_change_watcher(tx: mpsc::Sender<InputTrackerEvent>, enabled: Arc<AtomicBool>) {
    // On Windows/Linux, use 100ms interval for responsive detection
    const APP_POLL_INTERVAL: Duration = Duration::from_millis(100);

    let mut last_app = get_active_app_info_fast();
    log::info!(
        "[InputTracker] App watcher started, initial app: {} (pid: {:?}, bundle: {:?})",
        last_app.name,
        last_app.pid,
        last_app.bundle_id
    );
    let _ = tx.send(InputTrackerEvent::AppChanged(last_app.clone()));

    while enabled.load(Ordering::SeqCst) {
        thread::sleep(APP_POLL_INTERVAL);

        if !enabled.load(Ordering::SeqCst) {
            break;
        }

        let current_app = get_active_app_info_fast();

        // Always compare by PID - this is the most reliable way to detect app changes
        let app_changed = current_app.pid != last_app.pid;

        if app_changed {
            log::info!(
                "[InputTracker] App change detected: {} (pid: {:?}) -> {} (pid: {:?})",
                last_app.name,
                last_app.pid,
                current_app.name,
                current_app.pid
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

impl Drop for InputTrackerManager {
    fn drop(&mut self) {
        log::info!("[InputTracker] Dropping InputTrackerManager");
        self.stop();
    }
}
