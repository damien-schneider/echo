//! Windows can sink the HUD below normal windows while its topmost bit stays set; re-raise it.

use super::window::{OVERLAY_NOTIFICATION_LABEL, RECORDING_OVERLAY_LABEL};
use log::{debug, warn};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, EVENT_SYSTEM_FOREGROUND, HWND_TOPMOST, SET_WINDOW_POS_FLAGS, SWP_ASYNCWINDOWPOS,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, WINEVENT_OUTOFCONTEXT,
    WINEVENT_SKIPOWNPROCESS,
};

const HUD_LABELS: [&str; 2] = [RECORDING_OVERLAY_LABEL, OVERLAY_NOTIFICATION_LABEL];

/// No activation: caret stays in the paste target. Async: off-main-thread callers never block.
const RAISE_FLAGS: SET_WINDOW_POS_FLAGS = SET_WINDOW_POS_FLAGS(
    SWP_ASYNCWINDOWPOS.0 | SWP_NOACTIVATE.0 | SWP_NOMOVE.0 | SWP_NOSIZE.0 | SWP_NOOWNERZORDER.0,
);

static FOREGROUND_WATCH: OnceLock<AppHandle> = OnceLock::new();

/// Out-of-context hooks fire on the installing thread's message loop, hence the main thread.
pub(super) fn keep_hud_on_top(app_handle: &AppHandle) {
    if FOREGROUND_WATCH.set(app_handle.clone()).is_err() {
        return;
    }
    let installed = app_handle.run_on_main_thread(|| {
        let hook = unsafe {
            SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(on_foreground_change),
                0,
                0,
                WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
            )
        };
        if hook.0.is_null() {
            warn!("[Overlay] Foreground watch unavailable; the HUD may fall behind other apps");
        }
    });
    if let Err(error) = installed {
        warn!("[Overlay] Failed to schedule the foreground watch: {error}");
    }
}

unsafe extern "system" fn on_foreground_change(
    _hook: HWINEVENTHOOK,
    _event: u32,
    _window: HWND,
    _object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    if let Some(app_handle) = FOREGROUND_WATCH.get() {
        raise_hud(app_handle);
    }
}

fn raise_hud(app_handle: &AppHandle) {
    for label in HUD_LABELS {
        let Some(window) = app_handle.get_webview_window(label) else {
            continue;
        };
        if window.is_visible().unwrap_or(false) {
            raise_to_top(&window);
        }
    }
}

pub(super) fn raise_to_top(window: &WebviewWindow) {
    let Ok(handle) = window.hwnd() else {
        return;
    };
    let raised =
        unsafe { SetWindowPos(HWND(handle.0), Some(HWND_TOPMOST), 0, 0, 0, 0, RAISE_FLAGS) };
    if let Err(error) = raised {
        debug!("[Overlay] Failed to raise {} to the top: {error}", window.label());
    }
}

#[cfg(test)]
#[path = "windows_topmost_tests.rs"]
mod tests;
