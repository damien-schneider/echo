//! A transcript leaves as a promise: the system hands out the bytes only when an app actually
//! pastes, and that request is the only receipt a synthetic paste ever gets. Each platform serves
//! the promise in its own protocol; all of them return the same receipt.

use std::time::Instant;
use tokio::sync::oneshot;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(target_os = "windows")]
use windows as platform;

/// Who took the promised bytes. X11 names the requesting client; macOS and Windows hand them over
/// anonymously, so there the receipt says only that someone did.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub enum Fetcher {
    /// The client holding the input focus took the bytes — the paste reached the app it was aimed at.
    Focused,
    /// Another client took them: a clipboard manager reading the change, never the paste.
    Foreign,
    Unknown,
}

#[derive(Clone, Copy, Debug)]
pub struct Receipt {
    pub at: Instant,
    pub by: Fetcher,
}

/// Which revision of the clipboard the promise wrote. A different one later means the clipboard
/// moved on and the transcript is no longer Echo's to restore.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Generation(u64);

pub struct PromisedTranscript {
    /// Resolves on the first fetch of the promised text; closes unresolved when the clipboard is
    /// taken over before anyone pastes.
    pub consumed: oneshot::Receiver<Receipt>,
    pub generation: Generation,
}

/// Whether this platform can serve a promise at all — a Wayland session or a headless X display
/// cannot, and neither can an OS Echo has no promise protocol for.
pub fn is_available() -> bool {
    platform::is_available()
}

pub fn write_promised_transcript(text: &str) -> Result<PromisedTranscript, String> {
    platform::write_promised_transcript(text)
}

pub fn generation() -> Generation {
    platform::generation()
}
