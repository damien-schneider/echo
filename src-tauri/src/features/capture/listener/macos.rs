use std::cell::RefCell;

use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_graphics::event::{
    CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, EventField, KeyCode,
};

use super::InputSignal;

pub(super) fn access_granted() -> bool {
    crate::macos_accessibility::is_trusted()
}

pub(super) fn listen(on_signal: impl FnMut(InputSignal)) -> Result<(), String> {
    let on_signal = RefCell::new(on_signal);
    let tap = CGEventTap::new(
        CGEventTapLocation::Session,
        CGEventTapPlacement::HeadInsertEventTap,
        CGEventTapOptions::ListenOnly,
        vec![
            CGEventType::FlagsChanged,
            CGEventType::KeyDown,
            CGEventType::LeftMouseDown,
            CGEventType::RightMouseDown,
            CGEventType::OtherMouseDown,
            CGEventType::ScrollWheel,
        ],
        move |_proxy, event_type, event| {
            match event_type {
                CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput => {
                    log::warn!("[Capture] macOS disabled the double-shift tap; restarting it");
                    CFRunLoop::get_current().stop();
                }
                CGEventType::FlagsChanged => {
                    let key_code =
                        event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE) as u16;
                    let signal = if is_shift(key_code) {
                        if event.get_flags().contains(CGEventFlags::CGEventFlagShift) {
                            InputSignal::ShiftDown
                        } else {
                            InputSignal::ShiftUp
                        }
                    } else {
                        InputSignal::Interruption
                    };
                    on_signal.borrow_mut()(signal);
                }
                _ => on_signal.borrow_mut()(InputSignal::Interruption),
            }
            None
        },
    )
    .map_err(|()| "macOS refused an event tap for the double-shift shortcut".to_string())?;

    let source = tap
        .mach_port
        .create_runloop_source(0)
        .map_err(|()| "The double-shift tap could not join a run loop".to_string())?;

    unsafe {
        CFRunLoop::get_current().add_source(&source, kCFRunLoopCommonModes);
    }
    tap.enable();
    CFRunLoop::run_current();
    Ok(())
}

fn is_shift(key_code: u16) -> bool {
    key_code == KeyCode::SHIFT || key_code == KeyCode::RIGHT_SHIFT
}
