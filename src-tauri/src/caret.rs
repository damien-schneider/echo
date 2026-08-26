//! What the focus probe could establish about the caret a dictation is aimed at. Each platform
//! answers with what it can prove: macOS reads the focused element's accessibility role, Windows
//! looks for a caret in the foreground thread, and X11 says nothing at all — there the receipt
//! names the client that pasted, which settles it after the fact instead.

/// Never a gate on the paste, only the weight its receipt gets and whether the held-out card shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum CaretSight {
    /// Nothing usable: no permission, no focused element, or a platform that cannot say.
    Blind,
    /// The focused element answered clearly, and what it is cannot take a text paste.
    DeniedByRole,
    /// A text element demonstrably holds the focus.
    Affirmed,
}

#[cfg(target_os = "macos")]
pub(crate) fn sight_focused_caret() -> CaretSight {
    crate::macos_accessibility::sight_focused_caret()
}

/// A Win32 caret exists only where text is being edited, so its presence affirms and its absence
/// says nothing: Chromium and WPF surfaces edit text without ever creating one.
#[cfg(target_os = "windows")]
pub(crate) fn sight_focused_caret() -> CaretSight {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, GUITHREADINFO,
    };

    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_invalid() {
        return CaretSight::Blind;
    }
    let thread = unsafe { GetWindowThreadProcessId(foreground, None) };
    let Ok(size) = u32::try_from(std::mem::size_of::<GUITHREADINFO>()) else {
        return CaretSight::Blind;
    };
    let mut info = GUITHREADINFO {
        cbSize: size,
        ..Default::default()
    };
    if unsafe { GetGUIThreadInfo(thread, &mut info) }.is_err() || info.hwndCaret.is_invalid() {
        return CaretSight::Blind;
    }
    CaretSight::Affirmed
}

#[cfg(target_os = "linux")]
pub(crate) fn sight_focused_caret() -> CaretSight {
    CaretSight::Blind
}

/// Electron apps grow an accessibility tree only once asked, and only macOS lets Echo ask.
pub(crate) fn coax_frontmost_into_answering() {
    #[cfg(target_os = "macos")]
    crate::macos_accessibility::coax_frontmost_into_answering();
}
