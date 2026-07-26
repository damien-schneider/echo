//! Platform-abstracted system audio capture.
//!
//! Each platform module implements [`SystemAudioCapture`] and emits 16 kHz mono
//! f32 PCM samples down an [`mpsc::Receiver`]. Sample rate conversion and
//! channel downmix happen inside the platform module so callers only ever see
//! Whisper-ready audio.

use anyhow::Result;
use std::sync::mpsc;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// Trait for capturing system audio.
pub trait SystemAudioCapture: Send {
    /// Start capturing. Returns a receiver yielding 16 kHz mono f32 chunks.
    fn start(&mut self) -> Result<mpsc::Receiver<Vec<f32>>>;
    /// Stop capturing.
    fn stop(&mut self) -> Result<()>;
    /// Check if system audio capture is available on this platform.
    fn is_available() -> bool
    where
        Self: Sized;
}

/// Whether system audio capture can be used on this OS at runtime.
pub fn is_system_audio_available() -> bool {
    platform::is_available()
}

/// Construct a platform-appropriate capture instance.
pub fn create_system_capture() -> Result<Box<dyn SystemAudioCapture>> {
    platform::create()
}

// Platform glue — each module exposes `is_available()` + `create()`.
// Aliased so the rest of the file uses one stable name regardless of target.
#[cfg(target_os = "windows")]
use self::windows as platform;
#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod fallback {
    use super::*;
    pub fn is_available() -> bool {
        false
    }
    pub fn create() -> Result<Box<dyn SystemAudioCapture>> {
        anyhow::bail!("System audio capture is not supported on this platform")
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
use fallback as platform;
