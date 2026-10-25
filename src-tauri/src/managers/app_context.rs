//! Focused-app detection. Hot path: must stay <5ms.

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FocusedApp {
    /// macOS only.
    pub bundle_id: Option<String>,
    pub process_name: Option<String>,
    /// Windows only without AX permissions.
    pub window_title: Option<String>,
}

pub trait FocusedAppProvider: Send + Sync {
    fn current(&self) -> Option<FocusedApp>;
}

pub struct PlatformFocusedAppProvider;

impl FocusedAppProvider for PlatformFocusedAppProvider {
    fn current(&self) -> Option<FocusedApp> {
        #[cfg(target_os = "macos")]
        {
            return current_mac();
        }
        #[cfg(target_os = "windows")]
        {
            return current_windows();
        }
        #[cfg(target_os = "linux")]
        {
            return current_linux();
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        {
            None
        }
    }
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn current_mac() -> Option<FocusedApp> {
    use cocoa::base::{id, nil};
    use objc::rc::autoreleasepool;
    use objc::{class, msg_send, sel, sel_impl};

    // frontmostApplication + bundle/name accessors all autoreleased.
    autoreleasepool(|| unsafe {
        let workspace_class = class!(NSWorkspace);
        let workspace: id = msg_send![workspace_class, sharedWorkspace];
        if workspace == nil {
            return None;
        }
        let app: id = msg_send![workspace, frontmostApplication];
        if app == nil {
            return None;
        }

        let bundle_id = nsstring_to_string({
            let s: id = msg_send![app, bundleIdentifier];
            s
        });
        let process_name = nsstring_to_string({
            let s: id = msg_send![app, localizedName];
            s
        });

        if bundle_id.is_none() && process_name.is_none() {
            return None;
        }
        Some(FocusedApp {
            bundle_id,
            process_name,
            window_title: None,
        })
    })
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
unsafe fn nsstring_to_string(s: cocoa::base::id) -> Option<String> {
    use cocoa::base::nil;
    use cocoa::foundation::NSString;
    use std::ffi::CStr;

    if s == nil {
        return None;
    }
    let ptr = s.UTF8String();
    if ptr.is_null() {
        return None;
    }
    let cstr = CStr::from_ptr(ptr);
    match cstr.to_str() {
        Ok(slice) => {
            let owned = slice.to_owned();
            if owned.is_empty() {
                None
            } else {
                Some(owned)
            }
        }
        Err(_) => None,
    }
}

#[cfg(target_os = "windows")]
fn current_windows() -> Option<FocusedApp> {
    use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        let title_len = GetWindowTextLengthW(hwnd);
        let window_title = if title_len > 0 {
            let mut buf = vec![0u16; (title_len as usize) + 1];
            let copied = GetWindowTextW(hwnd, &mut buf);
            if copied > 0 {
                Some(String::from_utf16_lossy(&buf[..copied as usize]))
            } else {
                None
            }
        } else {
            None
        };

        let mut pid: u32 = 0;
        let _tid = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return Some(FocusedApp {
                bundle_id: None,
                process_name: None,
                window_title,
            });
        }
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(_) => {
                return Some(FocusedApp {
                    bundle_id: None,
                    process_name: None,
                    window_title,
                });
            }
        };
        let mut buf = vec![0u16; MAX_PATH as usize];
        let mut size: u32 = buf.len() as u32;
        let process_name = if QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size,
        )
        .is_ok()
        {
            let full = String::from_utf16_lossy(&buf[..size as usize]);
            full.rsplit(['\\', '/']).next().map(|s| s.to_string())
        } else {
            None
        };
        let _ = CloseHandle(handle);

        Some(FocusedApp {
            bundle_id: None,
            process_name,
            window_title,
        })
    }
}

/// X11/Wayland focused-window detection skipped.
#[cfg(target_os = "linux")]
#[allow(dead_code)]
fn current_linux() -> Option<FocusedApp> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    /// CI has no GUI; just verify no panic.
    #[cfg(target_os = "macos")]
    #[test]
    fn mac_provider_returns_some_focused_app_or_none() {
        let provider = PlatformFocusedAppProvider;
        let _ = provider.current();
    }

    /// Debug aid; cargo test print_focused_app -- --ignored --nocapture.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn print_focused_app() {
        let provider = PlatformFocusedAppProvider;
        println!("focused app: {:?}", provider.current());
    }
}
