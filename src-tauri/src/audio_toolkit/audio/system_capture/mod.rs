//! Resample and downmix happen per platform — callers only ever see 16 kHz mono f32.

use anyhow::Result;
use std::sync::mpsc;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub trait SystemAudioCapture: Send {
    /// Yields 16 kHz mono f32 chunks.
    fn start(&mut self) -> Result<mpsc::Receiver<Vec<f32>>>;
    fn stop(&mut self) -> Result<()>;
    fn is_available() -> bool
    where
        Self: Sized;
}

pub fn is_system_audio_available() -> bool {
    platform::is_available()
}

pub fn create_system_capture() -> Result<Box<dyn SystemAudioCapture>> {
    platform::create()
}

// aliased so the rest of the file names one backend regardless of target
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
