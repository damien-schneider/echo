//! Platform-specific application detection.
//!
//! This module provides a unified interface for detecting the currently
//! active application across macOS, Windows, and Linux.

use super::types::ActiveAppInfo;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
mod linux;

/// Get information about the currently active (frontmost) application.
/// Uses native OS APIs for fast and reliable detection.
#[cfg(target_os = "macos")]
pub fn get_active_app_info_fast() -> ActiveAppInfo {
    macos::get_active_app_info()
}

#[cfg(target_os = "windows")]
pub fn get_active_app_info_fast() -> ActiveAppInfo {
    windows::get_active_app_info()
}

#[cfg(target_os = "linux")]
pub fn get_active_app_info_fast() -> ActiveAppInfo {
    linux::get_active_app_info()
}

/// Fallback for unsupported platforms
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn get_active_app_info_fast() -> ActiveAppInfo {
    log::debug!("[InputTracker] Active app detection not supported on this platform");
    ActiveAppInfo::default()
}
