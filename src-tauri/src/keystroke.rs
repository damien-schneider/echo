#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Shortcut {
    Copy,
    Paste,
}

/// GPU terminals (Ghostty, Alacritty, kitty) read the modifier off the key event itself and ignore
/// the ambient flag state, so a separate modifier press reaches them as a bare letter.
#[cfg(target_os = "macos")]
pub(crate) fn send(shortcut: Shortcut) -> Result<(), String> {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGKeyCode};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    const COMMAND: CGKeyCode = 55;
    let key: CGKeyCode = match shortcut {
        Shortcut::Copy => 8,
        Shortcut::Paste => 9,
    };

    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .map_err(|()| "macOS refused an event source for the shortcut".to_string())?;
    let stroke = |code: CGKeyCode, down: bool, flags: CGEventFlags| -> Result<(), String> {
        let event = CGEvent::new_keyboard_event(source.clone(), code, down)
            .map_err(|()| format!("macOS refused a key event for code {code}"))?;
        event.set_flags(flags);
        event.post(CGEventTapLocation::HID);
        Ok(())
    };

    stroke(COMMAND, true, CGEventFlags::CGEventFlagCommand)?;
    stroke(key, true, CGEventFlags::CGEventFlagCommand)?;
    stroke(key, false, CGEventFlags::CGEventFlagCommand)?;
    stroke(COMMAND, false, CGEventFlags::CGEventFlagNull)
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn send(shortcut: Shortcut) -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    #[cfg(target_os = "windows")]
    let key = match shortcut {
        Shortcut::Copy => Key::Other(0x43),
        Shortcut::Paste => Key::Other(0x56),
    };
    #[cfg(target_os = "linux")]
    let key = match shortcut {
        Shortcut::Copy => Key::Unicode('c'),
        Shortcut::Paste => Key::Unicode('v'),
    };

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|error| format!("Failed to reach the keyboard: {error}"))?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|error| format!("Failed to press Control: {error}"))?;
    let clicked = enigo.key(key, Direction::Click);
    std::thread::sleep(std::time::Duration::from_millis(100));
    let released = enigo.key(Key::Control, Direction::Release);
    clicked.map_err(|error| format!("Failed to click the shortcut key: {error}"))?;
    released.map_err(|error| format!("Failed to release Control: {error}"))?;
    Ok(())
}
