use log::{error, warn};
use tauri::AppHandle;

const PASTE_NOT_PERMITTED: &str =
    "Allow Echo in Accessibility settings to paste — your text is on the clipboard";

pub(super) fn keep_without_pasting(app_handle: &AppHandle, text: &str) {
    warn!("deliver: Accessibility access is missing, the paste would be dropped");
    if let Err(error) = crate::clipboard::copy_to_clipboard(text, app_handle) {
        error!("Failed to keep the transcription anywhere: {error}");
    }
    crate::overlay::show_warning_overlay(app_handle, PASTE_NOT_PERMITTED);
    #[cfg(target_os = "macos")]
    offer_accessibility_settings(app_handle);
}

/// Once per run: settings opening over every dictation would take the focus needed to paste by hand.
#[cfg(target_os = "macos")]
fn offer_accessibility_settings(app_handle: &AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri_plugin_opener::OpenerExt;

    static ALREADY_OFFERED: AtomicBool = AtomicBool::new(false);
    if ALREADY_OFFERED.swap(true, Ordering::AcqRel) {
        return;
    }
    let opened = app_handle.opener().open_url(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        None::<String>,
    );
    if let Err(error) = opened {
        warn!("Could not open Accessibility settings: {error}");
    }
}
