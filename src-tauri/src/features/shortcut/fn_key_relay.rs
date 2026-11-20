//! WKWebView drops the Fn key before the page sees it, so the shortcut recorder hears it from here.

use std::ptr::NonNull;

use tauri::{AppHandle, Emitter};
use tauri_nspanel::objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags};

const FN_KEY_CODE: u16 = 63;
const FN_KEY_EVENT: &str = "fn-key";

pub fn install(app: &AppHandle) {
    let app = app.clone();
    let relay = block2::RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        let flags_change = unsafe { event.as_ref() };
        if flags_change.keyCode() == FN_KEY_CODE {
            let pressed = flags_change
                .modifierFlags()
                .contains(NSEventModifierFlags::Function);
            let _ = app.emit(FN_KEY_EVENT, pressed);
        }
        event.as_ptr()
    });
    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::FlagsChanged, &relay)
    };
    match monitor {
        Some(monitor) => std::mem::forget(monitor),
        None => log::warn!("[Shortcuts] Fn key relay unavailable; the recorder can't capture Fn"),
    }
}
