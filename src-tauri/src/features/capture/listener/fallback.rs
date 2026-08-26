use rdev::{EventType, Key};

use crate::managers::input_events::subscribe;

use super::InputSignal;

pub(super) fn access_granted() -> bool {
    true
}

pub(super) fn listen(mut on_signal: impl FnMut(InputSignal)) -> Result<(), String> {
    for event in subscribe() {
        match event.event_type {
            EventType::KeyPress(key) if is_shift(key) => on_signal(InputSignal::ShiftDown),
            EventType::KeyRelease(key) if is_shift(key) => on_signal(InputSignal::ShiftUp),
            EventType::KeyPress(_)
            | EventType::KeyRelease(_)
            | EventType::ButtonPress(_)
            | EventType::Wheel { .. } => on_signal(InputSignal::Interruption),
            _ => {}
        }
    }
    Err("The global key listener stopped".to_string())
}

fn is_shift(key: Key) -> bool {
    matches!(key, Key::ShiftLeft | Key::ShiftRight)
}
