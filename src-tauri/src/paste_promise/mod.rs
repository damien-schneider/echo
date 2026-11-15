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

/// Only X11 names the requesting client; macOS and Windows fetch anonymously.
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

/// A later mismatch means the clipboard moved on and the transcript is no longer Echo's to restore.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Generation(u64);

pub struct PromisedTranscript {
    /// Closes unresolved when the clipboard is taken over before anyone pastes.
    pub consumed: oneshot::Receiver<Receipt>,
    pub generation: Generation,
}

/// False on Wayland, headless X, and OSes without a promise protocol.
pub fn is_available() -> bool {
    platform::is_available()
}

pub fn write_promised_transcript(text: &str) -> Result<PromisedTranscript, String> {
    platform::write_promised_transcript(text)
}

pub fn generation() -> Generation {
    platform::generation()
}
