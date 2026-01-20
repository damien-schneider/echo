//! Windows-specific application detection using native Win32 APIs.

use super::ActiveAppInfo;

/// Get information about the currently active window on Windows
/// Uses native Windows APIs for fast and reliable detection
pub fn get_active_app_info() -> ActiveAppInfo {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        // Get the foreground window handle
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            log::debug!("[InputTracker] No foreground window");
            return ActiveAppInfo::default();
        }

        // Get the process ID from the window
        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));

        if process_id == 0 {
            log::debug!("[InputTracker] Failed to get process ID");
            return ActiveAppInfo::default();
        }

        // Open the process to query its name
        let process_handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
        {
            Ok(handle) => handle,
            Err(e) => {
                log::debug!("[InputTracker] Failed to open process: {}", e);
                return ActiveAppInfo::default();
            }
        };

        // Get the full process image name (executable path)
        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;

        let exe_path = if QueryFullProcessImageNameW(
            process_handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut size,
        )
        .is_ok()
        {
            let path = OsString::from_wide(&buffer[..size as usize]);
            path.to_string_lossy().into_owned()
        } else {
            String::new()
        };

        // Close the process handle
        let _ = windows::Win32::Foundation::CloseHandle(process_handle);

        if exe_path.is_empty() {
            return ActiveAppInfo::default();
        }

        // Extract the executable name from the path for the display name
        let name = std::path::Path::new(&exe_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_default();

        // Use the full executable path as bundle_id for unique identification
        let bundle_id = Some(exe_path);

        if name.is_empty() {
            ActiveAppInfo::default()
        } else {
            ActiveAppInfo {
                name,
                bundle_id,
                pid: Some(process_id as i32),
            }
        }
    }
}
