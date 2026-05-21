//! Focused-application context detection.
//!
//! Reads the user's currently focused app (macOS / Windows) and exposes
//! a [`Register`] classification so the cleanup-LLM prompt can tune its
//! tone (casual in Slack, formal in Mail, code in Xcode/VSCode, …).
//!
//! The platform layer is intentionally minimal: bundle identifier
//! (macOS) and process name + window title (Windows). No accessibility
//! permissions are requested — we only use public APIs.
//!
//! `current()` must stay well under 5 ms — it is called on the hot path
//! every time we decide to clean up a transcript.

use crate::managers::cleanup_prompt::Register;

/// A snapshot of the currently focused application.
///
/// All fields are optional because no single platform exposes all three:
/// macOS gives us `bundle_id` + `process_name` (no title without AX),
/// Windows gives us `process_name` + `window_title` (no bundle_id), Linux
/// gives us nothing reliable for now.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FocusedApp {
    /// macOS bundle identifier, e.g. `com.tinyspeck.slackmacgap`.
    pub bundle_id: Option<String>,
    /// Cross-platform human-readable app name, e.g. `Slack`,
    /// `Visual Studio Code`.
    pub process_name: Option<String>,
    /// Window title where available (Windows). `None` on macOS unless we
    /// later opt into accessibility permissions.
    pub window_title: Option<String>,
}

/// Abstraction over the per-platform focused-app lookup so tests can
/// inject a mock instead of poking at the real `NSWorkspace`.
pub trait FocusedAppProvider: Send + Sync {
    /// Return the currently focused app, or `None` if it cannot be
    /// determined (e.g. Linux, or a transient lookup failure).
    fn current(&self) -> Option<FocusedApp>;
}

/// Default provider used in production. Dispatches to the OS-specific
/// implementation at compile time via `cfg`.
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

// ── Register classification ──────────────────────────────────────────

/// Exact-match bundle IDs → Register. Highest priority signal because
/// bundle IDs are stable across localisations and macOS versions.
const BUNDLE_ID_EXACT: &[(&str, Register)] = &[
    // Casual
    ("com.tinyspeck.slackmacgap", Register::Casual),
    ("com.hnc.Discord", Register::Casual),
    ("com.apple.MobileSMS", Register::Casual),
    ("net.whatsapp.WhatsApp", Register::Casual),
    ("ph.telegra.Telegraph", Register::Casual),
    ("com.facebook.archon", Register::Casual),
    ("org.whispersystems.signal-desktop", Register::Casual),
    // Formal
    ("com.apple.mail", Register::Formal),
    ("com.microsoft.Outlook", Register::Formal),
    ("notion.id", Register::Formal),
    ("com.linear", Register::Formal),
    ("com.atlassian.confluence", Register::Formal),
    ("com.apple.iWork.Pages", Register::Formal),
    ("md.obsidian", Register::Formal),
    ("com.microsoft.Word", Register::Formal),
    // Code
    ("com.microsoft.VSCode", Register::Code),
    ("com.microsoft.VSCodeInsiders", Register::Code),
    ("com.todesktop.230313mzl4w4u92", Register::Code), // Cursor
    ("com.apple.dt.Xcode", Register::Code),
    ("com.jetbrains.intellij", Register::Code),
    ("com.jetbrains.pycharm", Register::Code),
    ("com.jetbrains.webstorm", Register::Code),
    ("com.googlecode.iterm2", Register::Code),
    ("com.apple.Terminal", Register::Code),
    ("dev.warp.Warp-Stable", Register::Code),
    ("com.mitchellh.ghostty", Register::Code),
    ("net.kovidgoyal.kitty", Register::Code),
    ("io.alacritty", Register::Code),
    ("dev.zed.Zed", Register::Code),
    ("com.sublimetext.4", Register::Code),
];

/// Substring matches (case-insensitive). Fallback when we don't have a
/// bundle ID, or when the bundle ID is unrecognized but contains an
/// obvious keyword. Order matters only for the loop — we return on first
/// hit.
const CASUAL_SUBSTRINGS: &[&str] = &[
    "slack",
    "discord",
    "messages",
    "whatsapp",
    "telegram",
    "messenger",
    "imessage",
    "signal",
];

const FORMAL_SUBSTRINGS: &[&str] = &[
    "mail",
    "outlook",
    "notion",
    "linear",
    "confluence",
    "docs.google",
    "microsoft word",
    "pages",
    "obsidian",
];

const CODE_SUBSTRINGS: &[&str] = &[
    "vscode",
    "visual studio code",
    "code-insiders",
    "cursor",
    "xcode",
    "intellij",
    "pycharm",
    "webstorm",
    "iterm",
    "terminal",
    "warp",
    "ghostty",
    "kitty",
    "alacritty",
    "vim",
    "nvim",
    "helix",
    "zed",
    "sublime_text",
];

/// Pick a [`Register`] for the given focused app.
///
/// Match layers (highest priority first):
///  1. Exact bundle-ID match against the `BUNDLE_ID_EXACT` table.
///  2. Case-insensitive substring match on the bundle ID.
///  3. Case-insensitive substring match on the process name.
///  4. Default to [`Register::Neutral`].
pub fn classify_register(app: &FocusedApp) -> Register {
    if let Some(bundle_id) = app.bundle_id.as_deref() {
        for (id, reg) in BUNDLE_ID_EXACT {
            if bundle_id.eq_ignore_ascii_case(id) {
                return *reg;
            }
        }
        if let Some(reg) = match_substring(bundle_id) {
            return reg;
        }
    }
    if let Some(process_name) = app.process_name.as_deref() {
        if let Some(reg) = match_substring(process_name) {
            return reg;
        }
    }
    Register::Neutral
}

fn match_substring(haystack: &str) -> Option<Register> {
    let lower = haystack.to_lowercase();
    for needle in CASUAL_SUBSTRINGS {
        if lower.contains(needle) {
            return Some(Register::Casual);
        }
    }
    for needle in FORMAL_SUBSTRINGS {
        if lower.contains(needle) {
            return Some(Register::Formal);
        }
    }
    for needle in CODE_SUBSTRINGS {
        if lower.contains(needle) {
            return Some(Register::Code);
        }
    }
    None
}

// ── macOS implementation ─────────────────────────────────────────────

#[cfg(target_os = "macos")]
#[allow(deprecated)] // cocoa crate is deprecated in favor of objc2-app-kit
fn current_mac() -> Option<FocusedApp> {
    use cocoa::base::{id, nil};
    use objc::rc::autoreleasepool;
    use objc::{class, msg_send, sel, sel_impl};

    // All Objective-C messaging must happen inside an autorelease pool
    // because `frontmostApplication` returns an autoreleased object
    // and the bundle/name accessors return autoreleased NSStrings.
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
#[allow(deprecated)] // cocoa crate is deprecated in favor of objc2-foundation
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

// ── Windows implementation ───────────────────────────────────────────

#[cfg(target_os = "windows")]
fn current_windows() -> Option<FocusedApp> {
    use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        // Window title.
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

        // Process name via PID → handle → executable path.
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
            // Basename of the executable.
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

// ── Linux implementation ─────────────────────────────────────────────

#[cfg(target_os = "linux")]
#[allow(dead_code)]
fn current_linux() -> Option<FocusedApp> {
    // X11/Wayland focused-window detection requires either an X11 socket
    // (xprop / xdotool / xcb) or a per-compositor protocol (kwin/sway/
    // hyprland/gnome shell extensions). Skipped for now; the cleanup
    // prompt will fall back to a Neutral register.
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app_with_bundle(bid: &str) -> FocusedApp {
        FocusedApp {
            bundle_id: Some(bid.to_string()),
            process_name: None,
            window_title: None,
        }
    }

    fn app_with_name(name: &str) -> FocusedApp {
        FocusedApp {
            bundle_id: None,
            process_name: Some(name.to_string()),
            window_title: None,
        }
    }

    #[test]
    fn classify_slack_as_casual() {
        let app = app_with_bundle("com.tinyspeck.slackmacgap");
        assert_eq!(classify_register(&app), Register::Casual);
    }

    #[test]
    fn classify_vscode_as_code() {
        let app = app_with_name("Visual Studio Code");
        assert_eq!(classify_register(&app), Register::Code);
    }

    #[test]
    fn classify_mail_as_formal() {
        let app = app_with_bundle("com.apple.mail");
        assert_eq!(classify_register(&app), Register::Formal);
    }

    #[test]
    fn classify_unknown_as_neutral() {
        let app = app_with_bundle("com.example.something");
        assert_eq!(classify_register(&app), Register::Neutral);
    }

    #[test]
    fn classify_substring_iterm() {
        let app = app_with_bundle("foo.bar.iterm.baz");
        assert_eq!(classify_register(&app), Register::Code);
    }

    #[test]
    fn classify_no_bundle_id_uses_process_name() {
        let app = app_with_name("WhatsApp");
        assert_eq!(classify_register(&app), Register::Casual);
    }

    #[test]
    fn classify_empty_app_is_neutral() {
        let app = FocusedApp::default();
        assert_eq!(classify_register(&app), Register::Neutral);
    }

    /// macOS smoke test: calling the real provider must not panic and
    /// must return a valid Option. We don't assert *which* app is
    /// focused because CI runners have no GUI session.
    #[cfg(target_os = "macos")]
    #[test]
    fn mac_provider_returns_some_focused_app_or_none() {
        let provider = PlatformFocusedAppProvider;
        let _ = provider.current(); // Just assert it doesn't panic.
    }

    /// Manual debug aid — prints the currently focused app. Ignored by
    /// default; run with `cargo test print_focused_app -- --ignored
    /// --nocapture`.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn print_focused_app() {
        let provider = PlatformFocusedAppProvider;
        println!("focused app: {:?}", provider.current());
    }
}
