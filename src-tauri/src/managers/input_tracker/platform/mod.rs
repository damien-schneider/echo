use super::types::ActiveAppInfo;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
mod linux;

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

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn get_active_app_info_fast() -> ActiveAppInfo {
    log::debug!("[InputTracker] Active app detection not supported on this platform");
    ActiveAppInfo::default()
}
