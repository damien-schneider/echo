//! Core types for the input tracker module.

use rdev::Key;

/// Events that can be sent through the input tracker channel
#[derive(Debug)]
pub enum InputTrackerEvent {
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

/// A keystroke event with key and optional unicode representation
#[derive(Debug)]
pub struct KeystrokeEvent {
    pub key: Key,
    pub unicode: Option<String>,
    pub is_press: bool,
}

/// Information about the currently active application
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ActiveAppInfo {
    pub name: String,
    pub bundle_id: Option<String>,
    pub pid: Option<i32>,
}

/// An entry of tracked input to be saved to the database
#[derive(Debug, Clone)]
pub struct InputEntry {
    pub app_name: String,
    pub app_bundle_id: Option<String>,
    pub app_pid: Option<i32>,
    pub content: String,
    pub timestamp: i64,
    pub duration_ms: i64,
}
