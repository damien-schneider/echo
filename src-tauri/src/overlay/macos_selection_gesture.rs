use core_foundation::base::{CFType, TCFType};
use core_foundation::dictionary::CFDictionary;
use core_foundation::string::CFString;
use core_graphics::window::{
    copy_window_info, kCGWindowBounds, kCGWindowListOptionIncludingWindow, CGWindowID,
};
use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use tauri_nspanel::objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags, NSEventType};
use tauri_nspanel::objc2_foundation::NSPoint;
use tokio::sync::Notify;

const SELECTION_DRAG_DISTANCE: f64 = 4.0;

static MONITOR_INSTALLED: AtomicBool = AtomicBool::new(false);
static SELECTION_GESTURE_ENDED: LazyLock<Notify> = LazyLock::new(Notify::new);

thread_local! {
    static PRESS: RefCell<Option<Press>> = const { RefCell::new(None) };
}

struct Press {
    at: NSPoint,
    window: Option<CGWindowID>,
    frame: Option<CFType>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Release {
    pub(super) travel: f64,
    pub(super) click_count: isize,
    pub(super) extends: bool,
    pub(super) moved_window: bool,
}

/// A drag, a double or triple click, or a shift-click can leave a selection behind; one that moved or resized its window did not.
pub(super) fn leaves_selection(release: Release) -> bool {
    !release.moved_window
        && (release.click_count >= 2
            || release.extends
            || release.travel >= SELECTION_DRAG_DISTANCE)
}

pub(super) async fn selection_gesture_ended() {
    SELECTION_GESTURE_ENDED.notified().await;
}

/// Accessibility is blind to some apps' selections; the end of the gesture that made one is the moment to ask the app by copying.
pub(super) fn watch_selection_gestures() -> Result<(), String> {
    if MONITOR_INSTALLED.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    let handler = block2::RcBlock::new(|event: NonNull<NSEvent>| unsafe {
        follow_pointer(event.as_ref());
    });
    let Some(monitor) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(
        NSEventMask::LeftMouseDown | NSEventMask::LeftMouseUp,
        &handler,
    ) else {
        MONITOR_INSTALLED.store(false, Ordering::Release);
        return Err("Failed to install the selection gesture monitor".to_string());
    };
    std::mem::forget(monitor);
    Ok(())
}

fn follow_pointer(event: &NSEvent) {
    if !super::chat_surface_is_open() {
        PRESS.set(None);
        return;
    }
    let event_type = event.r#type();
    if event_type == NSEventType::LeftMouseDown {
        let window = CGWindowID::try_from(event.windowNumber())
            .ok()
            .filter(|&window| window != 0);
        PRESS.set(Some(Press {
            at: event.locationInWindow(),
            window,
            frame: window.and_then(window_frame),
        }));
        return;
    }
    if event_type != NSEventType::LeftMouseUp {
        return;
    }
    let Some(press) = PRESS.take() else {
        return;
    };
    let release_at = event.locationInWindow();
    let release = Release {
        travel: (release_at.x - press.at.x).hypot(release_at.y - press.at.y),
        click_count: event.clickCount(),
        extends: event.modifierFlags().contains(NSEventModifierFlags::Shift),
        moved_window: press.window.and_then(window_frame) != press.frame,
    };
    if leaves_selection(release) {
        SELECTION_GESTURE_ENDED.notify_one();
    }
}

fn window_frame(window: CGWindowID) -> Option<CFType> {
    let windows = copy_window_info(kCGWindowListOptionIncludingWindow, window)?;
    let description = windows.get(0)?;
    let description: CFDictionary<CFString, CFType> =
        unsafe { CFDictionary::wrap_under_get_rule((*description).cast()) };
    let bounds_key = unsafe { CFString::wrap_under_get_rule(kCGWindowBounds) };
    description.find(&bounds_key).map(|bounds| bounds.clone())
}

#[cfg(test)]
#[path = "macos_selection_gesture_tests.rs"]
mod tests;
