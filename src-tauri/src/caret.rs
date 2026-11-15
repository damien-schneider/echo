//! What the focus probe could establish about the caret a dictation is aimed at, per platform.

/// Never gates the paste: it only weighs the receipt and decides the held-out card.
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

#[cfg(target_os = "windows")]
pub(crate) fn sight_focused_caret() -> CaretSight {
    crate::windows_accessibility::sight_focused_caret()
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
