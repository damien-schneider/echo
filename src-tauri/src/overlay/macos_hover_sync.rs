use super::layout::OverlaySurfaceKind;
use super::macos_hover::{
    decide_hover_key, hover_pointer_inside, overlay_hover_region_for_pointer, panel_hover_state,
    HoverKeyAction, HoverKeySample, PanelHoverState, HOVER_PANELS, SYNTHETIC_KEY_SUPPRESSED,
};
use super::screen_follow::{self, FollowStep};
use objc2::{msg_send, runtime::AnyObject};
use std::{
    ptr::NonNull,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_nspanel::objc2_app_kit::{NSEvent, NSEventMask, NSEventType};
use tauri_nspanel::objc2_foundation::{NSPoint, NSRect};

static HOVER_KEY_MONITORS_INSTALLED: AtomicBool = AtomicBool::new(false);

pub(super) fn register_panel_window(
    kind: OverlaySurfaceKind,
    window: &WebviewWindow,
) -> Result<(), String> {
    let address = window
        .ns_window()
        .map_err(|error| format!("Failed to resolve the overlay NSWindow: {error}"))?
        as usize;
    panel_hover_state(kind).register_ns_window(address);
    install_hover_key_monitors(window.app_handle().clone())
}

/// CSS `:hover` in a WKWebView only updates while the host window is key, and `mouseMoved:` is unimplemented (rdar://88025610).
/// Spotlight's workaround: take key on this non-activating panel while the pointer is inside, resign the moment it leaves.
fn install_hover_key_monitors(app_handle: AppHandle) -> Result<(), String> {
    if HOVER_KEY_MONITORS_INSTALLED.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    let global_app_handle = app_handle.clone();
    let global_handler = block2::RcBlock::new(move |event: NonNull<NSEvent>| unsafe {
        handle_overlay_pointer_event(&global_app_handle, event);
    });
    let pointer_motion_mask =
        NSEventMask::MouseMoved | NSEventMask::LeftMouseDragged | NSEventMask::LeftMouseUp;
    let Some(global_monitor) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(
        pointer_motion_mask,
        &global_handler,
    ) else {
        HOVER_KEY_MONITORS_INSTALLED.store(false, Ordering::Release);
        return Err("Failed to install the global overlay hover monitor".to_string());
    };
    let local_handler = block2::RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        unsafe {
            handle_overlay_pointer_event(&app_handle, event);
        }
        event.as_ptr()
    });
    let Some(local_monitor) = (unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(pointer_motion_mask, &local_handler)
    }) else {
        unsafe { NSEvent::removeMonitor(&global_monitor) };
        HOVER_KEY_MONITORS_INSTALLED.store(false, Ordering::Release);
        return Err("Failed to install the local overlay hover monitor".to_string());
    };
    std::mem::forget(global_monitor);
    std::mem::forget(local_monitor);
    log::info!("[Overlay] hover monitors installed");
    Ok(())
}

unsafe fn handle_overlay_pointer_event(app_handle: &AppHandle, event: NonNull<NSEvent>) {
    if super::snap::drag_is_active() {
        drive_active_drag(app_handle, event.as_ref().r#type());
        return;
    }
    sync_hover_key_possession(app_handle);
}

/// A drag owns the pointer — hover possession would fight the compositor and collapse the island mid-flight.
fn drive_active_drag(app_handle: &AppHandle, event_type: NSEventType) {
    if event_type != NSEventType::LeftMouseUp {
        let _ = super::snap::refresh_snap_preview(app_handle);
        return;
    }
    let _ = super::snap::finish_drag(app_handle);
    sync_hover_key_possession(app_handle);
}

/// Panels are independent — the one under the pointer takes key, the others let it go.
pub(super) fn sync_hover_key_possession(app_handle: &AppHandle) {
    let mut pointer_captured = false;
    let mut keyboard_mode = false;
    for panel in HOVER_PANELS {
        let Some(address) = panel.ns_window() else {
            continue;
        };
        keyboard_mode = keyboard_mode || panel.accepts_key();
        pointer_captured =
            unsafe { sync_panel_hover_key(panel, address as *mut AnyObject, app_handle) }
                || pointer_captured;
    }
    if pointer_captured || keyboard_mode {
        screen_follow::disarm();
        return;
    }
    let hud = panel_hover_state(OverlaySurfaceKind::Hud);
    if let Some(address) = hud.ns_window() {
        unsafe { follow_cursor_screen(address as *mut AnyObject, app_handle) };
    }
}

unsafe fn sync_panel_hover_key(
    panel: &PanelHoverState,
    ns_window: *mut AnyObject,
    app_handle: &AppHandle,
) -> bool {
    let is_visible: bool = msg_send![&*ns_window, isVisible];
    let frame: NSRect = msg_send![&*ns_window, frame];
    let pointer = NSEvent::mouseLocation();
    let was_inside = panel.pointer_inside();
    let frame_tuple = (
        frame.origin.x,
        frame.origin.y,
        frame.size.width,
        frame.size.height,
    );
    let pointer_inside =
        overlay_hover_region_for_pointer(frame_tuple, is_visible, panel.hover_box())
            .is_some_and(|region| hover_pointer_inside(region, (pointer.x, pointer.y), was_inside));
    let panel_is_key: bool = msg_send![&*ns_window, isKeyWindow];
    let action = decide_hover_key(HoverKeySample {
        keyboard_mode: panel.accepts_key(),
        panel_is_key,
        synthetic_key_suppressed: SYNTHETIC_KEY_SUPPRESSED.load(Ordering::Acquire),
        pointer_inside,
    });
    // publish pointer state first — AppKit reads ownership when hit testing turns on
    panel.store_pointer_inside(pointer_inside);
    if pointer_inside && !was_inside {
        set_ignores_mouse_events(ns_window, false);
    }
    match action {
        HoverKeyAction::TakeKey => {
            crate::macos_accessibility::remember_selected_text_before_overlay_focus();
            log::info!("[Overlay] hover key: take ({})", panel.label());
            let _: () = msg_send![&*ns_window, makeKeyWindow];
        }
        HoverKeyAction::ReleaseKey => {
            log::info!("[Overlay] hover key: release ({})", panel.label());
            let _: () = msg_send![&*ns_window, resignKeyWindow];
        }
        HoverKeyAction::Stand => {}
    }
    if !pointer_inside && was_inside {
        set_ignores_mouse_events(ns_window, true);
    }
    if pointer_inside != was_inside {
        panel.publish_pointer_boundary(app_handle, pointer_inside);
    }
    pointer_inside
}

unsafe fn set_ignores_mouse_events(ns_window: *mut AnyObject, ignores: bool) {
    let _: () = msg_send![&*ns_window, setIgnoresMouseEvents: ignores];
}

/// Pointer settling on another display hands the island over to it.
unsafe fn follow_cursor_screen(ns_window: *mut AnyObject, app_handle: &AppHandle) {
    let is_visible: bool = msg_send![&*ns_window, isVisible];
    let screen: *mut AnyObject = msg_send![&*ns_window, screen];
    if !is_visible || screen.is_null() {
        screen_follow::disarm();
        return;
    }
    let frame: NSRect = msg_send![&*screen, frame];
    let pointer: NSPoint = NSEvent::mouseLocation();
    let pointer_is_away = !screen_follow::pointer_is_on_screen(
        (
            frame.origin.x,
            frame.origin.y,
            frame.size.width,
            frame.size.height,
        ),
        (pointer.x, pointer.y),
    );
    match screen_follow::follow_step(pointer_is_away, screen_follow::dwell()) {
        FollowStep::Hold => {}
        FollowStep::Disarm => screen_follow::disarm(),
        FollowStep::Arm => {
            screen_follow::arm();
            schedule_dwell_recheck(app_handle);
        }
        FollowStep::Move => {
            screen_follow::disarm();
            log::info!("[Overlay] cursor settled on another screen; handing the island over");
            screen_follow::request_handoff(app_handle);
        }
    }
}

/// A pointer that settles stops sending samples: the dwell needs its own wake-up.
fn schedule_dwell_recheck(app_handle: &AppHandle) {
    let waiting = app_handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(screen_follow::SCREEN_FOLLOW_DWELL);
        let syncing = waiting.clone();
        let _ = waiting.run_on_main_thread(move || sync_hover_key_possession(&syncing));
    });
}
