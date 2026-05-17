//! Windows system audio capture via WASAPI loopback.
//!
//! Loopback hangs off the default render (output) endpoint. Initializing the
//! audio client in shared mode against a render device with the loopback flag
//! set delivers exactly what the user hears, without affecting playback.

use anyhow::{anyhow, Context, Result};
use log::{debug, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use wasapi::{
    initialize_mta, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat,
};

use super::SystemAudioCapture;
use crate::audio_toolkit::audio::FrameResampler;

const NATIVE_SAMPLE_RATE: u32 = 48_000;
const TARGET_SAMPLE_RATE: u32 = 16_000;
const NATIVE_CHANNELS: u16 = 2;

pub struct WindowsSystemCapture {
    shutdown: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}

impl WindowsSystemCapture {
    pub fn new() -> Result<Self> {
        Ok(Self {
            shutdown: Arc::new(AtomicBool::new(false)),
            worker: None,
        })
    }
}

impl SystemAudioCapture for WindowsSystemCapture {
    fn start(&mut self) -> Result<mpsc::Receiver<Vec<f32>>> {
        let (tx, rx) = mpsc::channel::<Vec<f32>>();
        let shutdown = self.shutdown.clone();
        shutdown.store(false, Ordering::SeqCst);

        let handle = thread::Builder::new()
            .name("wasapi-loopback".into())
            .spawn(move || {
                if let Err(e) = capture_loop(tx, shutdown) {
                    warn!("WASAPI loopback capture exited with error: {e:#}");
                }
            })
            .context("spawn wasapi-loopback thread")?;

        self.worker = Some(handle);
        debug!("Windows system audio (WASAPI loopback) capture started");
        Ok(rx)
    }

    fn stop(&mut self) -> Result<()> {
        self.shutdown.store(true, Ordering::SeqCst);
        if let Some(h) = self.worker.take() {
            // Worker exits at the next 1s WASAPI tick.
            let _ = h.join();
        }
        debug!("Windows system audio capture stopped");
        Ok(())
    }

    fn is_available() -> bool {
        true
    }
}

pub fn is_available() -> bool {
    WindowsSystemCapture::is_available()
}

pub fn create() -> Result<Box<dyn SystemAudioCapture>> {
    Ok(Box::new(WindowsSystemCapture::new()?))
}

fn capture_loop(tx: mpsc::Sender<Vec<f32>>, shutdown: Arc<AtomicBool>) -> Result<()> {
    initialize_mta()
        .ok()
        .map_err(|e| anyhow!("initialize_mta failed: {e:?}"))?;

    let enumerator = DeviceEnumerator::new().context("WASAPI: create device enumerator")?;
    let device = enumerator
        .get_default_device(&Direction::Render)
        .context("WASAPI: default render device")?;
    let mut audio_client = device
        .get_iaudioclient()
        .context("WASAPI: get IAudioClient")?;

    let desired = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        NATIVE_SAMPLE_RATE as usize,
        NATIVE_CHANNELS as usize,
        None,
    );
    let blockalign = desired.get_blockalign() as usize;
    let channels = desired.get_nchannels() as usize;

    let (_default_period, min_period) = audio_client
        .get_device_period()
        .context("WASAPI: get_device_period")?;
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: min_period,
    };
    audio_client
        .initialize_client(&desired, &Direction::Render, &mode)
        .context("WASAPI: initialize_client (loopback)")?;

    let h_event = audio_client
        .set_get_eventhandle()
        .context("WASAPI: event handle")?;
    let buffer_frame_count = audio_client.get_buffer_size().context("WASAPI: buffer size")? as usize;
    let capture_client = audio_client
        .get_audiocaptureclient()
        .context("WASAPI: capture client")?;

    let mut resampler = FrameResampler::new(
        NATIVE_SAMPLE_RATE as usize,
        TARGET_SAMPLE_RATE as usize,
        Duration::from_millis(100),
    );

    let mut scratch = vec![0u8; blockalign * buffer_frame_count];

    audio_client.start_stream().context("WASAPI: start_stream")?;

    while !shutdown.load(Ordering::Relaxed) {
        if h_event.wait_for_event(1000).is_err() {
            // Timeout — loop and re-check shutdown flag.
            continue;
        }

        loop {
            let (frames, info) = match capture_client.read_from_device(&mut scratch) {
                Ok(v) => v,
                Err(e) => {
                    warn!("WASAPI: read_from_device error: {e:?}");
                    break;
                }
            };
            if frames == 0 {
                break;
            }
            let n_bytes = frames as usize * blockalign;
            let n_frames = frames as usize;
            // 4 bytes per sample (Float32), `channels` samples per frame
            let mut interleaved: Vec<f32> = Vec::with_capacity(n_frames * channels);
            if info.flags.silent {
                interleaved.resize(n_frames * channels, 0.0);
            } else {
                for i in 0..(n_bytes / 4) {
                    let b = [
                        scratch[i * 4],
                        scratch[i * 4 + 1],
                        scratch[i * 4 + 2],
                        scratch[i * 4 + 3],
                    ];
                    interleaved.push(f32::from_le_bytes(b));
                }
            }

            // Downmix to mono.
            let mut mono: Vec<f32> = Vec::with_capacity(n_frames);
            if channels == 1 {
                mono = interleaved;
            } else {
                for frame in interleaved.chunks_exact(channels) {
                    let avg: f32 = frame.iter().sum::<f32>() / channels as f32;
                    mono.push(avg);
                }
            }

            let tx_clone = tx.clone();
            resampler.push(&mono, |frame| {
                let _ = tx_clone.send(frame.to_vec());
            });
        }
    }

    audio_client.stop_stream().context("WASAPI: stop_stream")?;
    Ok(())
}
