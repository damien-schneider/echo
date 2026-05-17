//! macOS system audio capture via ScreenCaptureKit (12.3+, audio extraction
//! requires 13.0+).
//!
//! ScreenCaptureKit can deliver an audio-only feed of the system mix when the
//! stream config has `captures_audio = true`. Video must still be requested
//! (CoreMedia constraint) but we ask for a tiny 2x2 frame and discard the
//! Screen output type in the handler.
//!
//! Requires `NSScreenCaptureUsageDescription` in the app's Info.plist; the OS
//! prompts the user the first time `start_capture()` is called.

use anyhow::{anyhow, Context, Result};
use log::{debug, warn};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use screencapturekit::prelude::*;

use super::SystemAudioCapture;
use crate::audio_toolkit::audio::FrameResampler;

const NATIVE_SAMPLE_RATE: u32 = 48_000;
const TARGET_SAMPLE_RATE: u32 = 16_000;

pub struct MacOsSystemCapture {
    stream: Option<SCStream>,
}

impl MacOsSystemCapture {
    pub fn new() -> Result<Self> {
        Ok(Self { stream: None })
    }
}

impl SystemAudioCapture for MacOsSystemCapture {
    fn start(&mut self) -> Result<mpsc::Receiver<Vec<f32>>> {
        let (tx, rx) = mpsc::channel::<Vec<f32>>();

        let content =
            SCShareableContent::get().context("ScreenCaptureKit: query shareable content")?;
        let display = content
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("ScreenCaptureKit: no display available"))?;

        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();

        let config = SCStreamConfiguration::new()
            .with_width(2)
            .with_height(2)
            .with_captures_audio(true)
            .with_sample_rate(NATIVE_SAMPLE_RATE as i32)
            .with_channel_count(1);

        let mut stream = SCStream::new(&filter, &config);
        let handler = AudioHandler::new(tx);
        stream.add_output_handler(handler, SCStreamOutputType::Audio);
        stream
            .start_capture()
            .map_err(|e| anyhow!("ScreenCaptureKit: start_capture failed (Screen Recording permission?): {e}"))?;

        self.stream = Some(stream);
        debug!("macOS system audio capture started");
        Ok(rx)
    }

    fn stop(&mut self) -> Result<()> {
        if let Some(stream) = self.stream.take() {
            stream
                .stop_capture()
                .map_err(|e| anyhow!("ScreenCaptureKit: stop_capture failed: {e}"))?;
            debug!("macOS system audio capture stopped");
        }
        Ok(())
    }

    fn is_available() -> bool {
        // Screen Recording permission still has to be granted at first run.
        true
    }
}

pub fn is_available() -> bool {
    MacOsSystemCapture::is_available()
}

pub fn create() -> Result<Box<dyn SystemAudioCapture>> {
    Ok(Box::new(MacOsSystemCapture::new()?))
}

/// Receives ScreenCaptureKit audio buffers, resamples to 16 kHz mono f32, ships
/// them down `tx`. The output trait callback runs on a CoreMedia dispatch
/// queue; SCK serializes calls per handler so the Mutex is uncontended.
struct AudioHandler {
    tx: mpsc::Sender<Vec<f32>>,
    resampler: Arc<Mutex<FrameResampler>>,
}

impl AudioHandler {
    fn new(tx: mpsc::Sender<Vec<f32>>) -> Self {
        let resampler = FrameResampler::new(
            NATIVE_SAMPLE_RATE as usize,
            TARGET_SAMPLE_RATE as usize,
            Duration::from_millis(100),
        );
        Self {
            tx,
            resampler: Arc::new(Mutex::new(resampler)),
        }
    }
}

impl SCStreamOutputTrait for AudioHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
        if !matches!(of_type, SCStreamOutputType::Audio) {
            return;
        }
        let Some(abl) = sample.audio_buffer_list() else {
            return;
        };

        let mut input_samples: Vec<f32> = Vec::new();
        for buf in abl.iter() {
            let bytes = buf.data();
            // SCK with .with_captures_audio(true) delivers Float32 PCM.
            // bytes.len() is always a multiple of 4.
            let n = bytes.len() / 4;
            input_samples.reserve(n);
            for i in 0..n {
                let b = [
                    bytes[i * 4],
                    bytes[i * 4 + 1],
                    bytes[i * 4 + 2],
                    bytes[i * 4 + 3],
                ];
                input_samples.push(f32::from_le_bytes(b));
            }
        }

        if input_samples.is_empty() {
            return;
        }

        let tx = self.tx.clone();
        let mut rs = match self.resampler.lock() {
            Ok(g) => g,
            Err(_) => {
                warn!("system audio resampler mutex poisoned");
                return;
            }
        };
        rs.push(&input_samples, |frame: &[f32]| {
            let _ = tx.send(frame.to_vec());
        });
    }
}
