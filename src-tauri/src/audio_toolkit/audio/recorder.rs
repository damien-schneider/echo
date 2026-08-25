use std::{
    io::Error,
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, Sample, SizedSample,
};

use crate::audio_toolkit::{
    audio::{AudioVisualiser, FrameResampler},
    constants,
    vad::{self, VadFrame},
    VoiceActivityDetector,
};
use log::{debug, error, warn};

enum Cmd {
    Start(Option<mpsc::Sender<CapturedAudioFrame>>),
    Stop(mpsc::Sender<RecordedAudio>),
    Shutdown,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CapturedAudioFrame {
    pub samples: Vec<f32>,
    pub is_speech: bool,
}

#[derive(Debug, Default)]
pub(crate) struct RecordedAudio {
    pub had_long_pause: bool,
    pub samples: Vec<f32>,
}

pub struct AudioRecorder {
    device: Option<Device>,
    cmd_tx: Option<mpsc::Sender<Cmd>>,
    worker_handle: Option<std::thread::JoinHandle<()>>,
    vad: Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
    level_cb: Option<Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static>>,
    silence_cb: Option<Arc<dyn Fn() + Send + Sync + 'static>>,
}

impl AudioRecorder {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(AudioRecorder {
            device: None,
            cmd_tx: None,
            worker_handle: None,
            vad: None,
            level_cb: None,
            silence_cb: None,
        })
    }

    pub fn with_vad(mut self, vad: Box<dyn VoiceActivityDetector>) -> Self {
        self.vad = Some(Arc::new(Mutex::new(vad)));
        self
    }

    pub fn with_level_callback<F>(mut self, cb: F) -> Self
    where
        F: Fn(Vec<f32>) + Send + Sync + 'static,
    {
        self.level_cb = Some(Arc::new(cb));
        self
    }

    /// Fires at most once per recording when the input stayed digitally silent throughout.
    pub fn with_silence_callback<F>(mut self, cb: F) -> Self
    where
        F: Fn() + Send + Sync + 'static,
    {
        self.silence_cb = Some(Arc::new(cb));
        self
    }

    pub fn open(&mut self, device: Option<Device>) -> Result<(), Box<dyn std::error::Error>> {
        if self.worker_handle.is_some() {
            return Ok(()); // already open
        }

        let (sample_tx, sample_rx) = mpsc::channel::<Vec<f32>>();
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();

        let host = crate::audio_toolkit::get_cpal_host();
        let device = match device {
            Some(dev) => dev,
            None => host
                .default_input_device()
                .ok_or_else(|| Error::new(std::io::ErrorKind::NotFound, "No input device found"))?,
        };

        let thread_device = device.clone();
        let vad = self.vad.clone();
        let level_cb = self.level_cb.clone();
        let silence_cb = self.silence_cb.clone();

        let worker = std::thread::spawn(move || {
            let config = AudioRecorder::get_preferred_config(&thread_device)
                .expect("failed to fetch preferred config");

            let sample_rate = config.sample_rate().0;
            let channels = config.channels() as usize;

            debug!(
                "Using device: {:?}\nSample rate: {}\nChannels: {}\nFormat: {:?}",
                thread_device.name(),
                sample_rate,
                channels,
                config.sample_format()
            );

            let stream = match config.sample_format() {
                cpal::SampleFormat::U8 => {
                    AudioRecorder::build_stream::<u8>(&thread_device, &config, sample_tx, channels)
                        .unwrap()
                }
                cpal::SampleFormat::I8 => {
                    AudioRecorder::build_stream::<i8>(&thread_device, &config, sample_tx, channels)
                        .unwrap()
                }
                cpal::SampleFormat::I16 => {
                    AudioRecorder::build_stream::<i16>(&thread_device, &config, sample_tx, channels)
                        .unwrap()
                }
                cpal::SampleFormat::I32 => {
                    AudioRecorder::build_stream::<i32>(&thread_device, &config, sample_tx, channels)
                        .unwrap()
                }
                cpal::SampleFormat::F32 => {
                    AudioRecorder::build_stream::<f32>(&thread_device, &config, sample_tx, channels)
                        .unwrap()
                }
                _ => panic!("unsupported sample format"),
            };

            stream.play().expect("failed to start stream");

            run_consumer(sample_rate, vad, sample_rx, cmd_rx, level_cb, silence_cb);
        });

        self.device = Some(device);
        self.cmd_tx = Some(cmd_tx);
        self.worker_handle = Some(worker);

        Ok(())
    }

    pub fn start(
        &self,
        chunk_tx: Option<mpsc::Sender<CapturedAudioFrame>>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(tx) = &self.cmd_tx {
            tx.send(Cmd::Start(chunk_tx))?;
        }
        Ok(())
    }

    pub fn stop(&self) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
        self.stop_with_metadata().map(|recording| recording.samples)
    }

    pub(crate) fn stop_with_metadata(&self) -> Result<RecordedAudio, Box<dyn std::error::Error>> {
        let (resp_tx, resp_rx) = mpsc::channel();
        // no `cmd_tx` means nothing will ever answer `resp_rx` — bail instead of blocking forever
        let Some(tx) = &self.cmd_tx else {
            debug!("AudioRecorder::stop() called with no open stream — returning empty buffer");
            return Ok(RecordedAudio::default());
        };
        tx.send(Cmd::Stop(resp_tx))?;
        // bounded — a wedged device must surface fast, not stall the caller
        match resp_rx.recv_timeout(Duration::from_millis(1500)) {
            Ok(recording) => Ok(recording),
            Err(mpsc::RecvTimeoutError::Timeout) => Err("recorder stop timed out".into()),
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("recorder worker disconnected before replying".into())
            }
        }
    }

    pub fn close(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.send(Cmd::Shutdown);
        }
        if let Some(h) = self.worker_handle.take() {
            let _ = h.join();
        }
        self.device = None;
        Ok(())
    }

    fn build_stream<T>(
        device: &cpal::Device,
        config: &cpal::SupportedStreamConfig,
        sample_tx: mpsc::Sender<Vec<f32>>,
        channels: usize,
    ) -> Result<cpal::Stream, cpal::BuildStreamError>
    where
        T: Sample + SizedSample + Send + 'static,
        f32: cpal::FromSample<T>,
    {
        let mut output_buffer = Vec::new();

        let stream_cb = move |data: &[T], _: &cpal::InputCallbackInfo| {
            output_buffer.clear();

            if channels == 1 {
                output_buffer.extend(data.iter().map(|&sample| sample.to_sample::<f32>()));
            } else {
                let frame_count = data.len() / channels;
                output_buffer.reserve(frame_count);

                for frame in data.chunks_exact(channels) {
                    let mono_sample = frame
                        .iter()
                        .map(|&sample| sample.to_sample::<f32>())
                        .sum::<f32>()
                        / channels as f32;
                    output_buffer.push(mono_sample);
                }
            }

            if sample_tx.send(output_buffer.clone()).is_err() {
                error!("Failed to send samples");
            }
        };

        device.build_input_stream(
            &config.clone().into(),
            stream_cb,
            |err| warn!("Stream error: {}", err),
            None,
        )
    }

    fn get_preferred_config(
        device: &cpal::Device,
    ) -> Result<cpal::SupportedStreamConfig, Box<dyn std::error::Error>> {
        let supported_configs = device.supported_input_configs()?;

        for config_range in supported_configs {
            if config_range.min_sample_rate().0 <= constants::WHISPER_SAMPLE_RATE
                && config_range.max_sample_rate().0 >= constants::WHISPER_SAMPLE_RATE
            {
                return Ok(
                    config_range.with_sample_rate(cpal::SampleRate(constants::WHISPER_SAMPLE_RATE))
                );
            }
        }

        Ok(device.default_input_config()?)
    }
}

const LONG_PAUSE_MIN_SAMPLES: usize = constants::WHISPER_SAMPLE_RATE as usize / 2;
pub(crate) const PAUSE_SEPARATOR_SAMPLES: usize = constants::WHISPER_SAMPLE_RATE as usize * 3 / 10;

/// Below this a sample is not quiet but absent — the pipe delivers digital zeros when macOS denies
/// the microphone or the device is muted at the source.
const DIGITAL_SILENCE_AMPLITUDE: f32 = 1e-4;

/// Flags a recording that never heard anything: real microphones idle above the noise floor, so only
/// a blocked or muted input stays digitally silent from the first sample on.
struct SilenceWatchdog {
    threshold_samples: usize,
    silent_samples: usize,
    reported: bool,
}

impl SilenceWatchdog {
    fn new(threshold_samples: usize) -> Self {
        Self {
            threshold_samples,
            silent_samples: 0,
            reported: false,
        }
    }

    fn observe(&mut self, samples: &[f32]) -> bool {
        if self.reported {
            return false;
        }
        if samples
            .iter()
            .any(|sample| sample.abs() >= DIGITAL_SILENCE_AMPLITUDE)
        {
            self.silent_samples = 0;
            return false;
        }
        self.silent_samples += samples.len();
        if self.silent_samples >= self.threshold_samples {
            self.reported = true;
            true
        } else {
            false
        }
    }

    fn reset(&mut self) {
        self.silent_samples = 0;
        self.reported = false;
    }
}

#[derive(Default)]
struct RecordedAudioBuffer {
    pending_silence_samples: usize,
    had_long_pause: bool,
    samples: Vec<f32>,
}

impl RecordedAudioBuffer {
    fn clear(&mut self) {
        self.pending_silence_samples = 0;
        self.had_long_pause = false;
        self.samples.clear();
    }

    fn push(&mut self, frame: &CapturedAudioFrame) {
        if frame.is_speech {
            if !self.samples.is_empty() && self.pending_silence_samples >= LONG_PAUSE_MIN_SAMPLES {
                self.had_long_pause = true;
                self.samples
                    .resize(self.samples.len() + PAUSE_SEPARATOR_SAMPLES, 0.0);
            }
            self.pending_silence_samples = 0;
            self.samples.extend_from_slice(&frame.samples);
            return;
        }
        if !self.samples.is_empty() {
            self.pending_silence_samples = self
                .pending_silence_samples
                .saturating_add(frame.samples.len());
        }
    }

    fn take_recording(&mut self) -> RecordedAudio {
        let recording = RecordedAudio {
            had_long_pause: self.had_long_pause,
            samples: std::mem::take(&mut self.samples),
        };
        *self = Self::default();
        recording
    }
}

fn record_captured_frame(
    frame: CapturedAudioFrame,
    recording_buffer: &mut RecordedAudioBuffer,
    chunk_tx: &Option<mpsc::Sender<CapturedAudioFrame>>,
) {
    recording_buffer.push(&frame);
    if let Some(tx) = chunk_tx {
        let _ = tx.send(frame);
    }
}

fn run_consumer(
    in_sample_rate: u32,
    vad: Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
    sample_rx: mpsc::Receiver<Vec<f32>>,
    cmd_rx: mpsc::Receiver<Cmd>,
    level_cb: Option<Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static>>,
    silence_cb: Option<Arc<dyn Fn() + Send + Sync + 'static>>,
) {
    let mut frame_resampler = FrameResampler::new(
        in_sample_rate as usize,
        constants::WHISPER_SAMPLE_RATE as usize,
        Duration::from_millis(30),
    );

    let mut recorded_audio = RecordedAudioBuffer::default();
    let mut recording = false;
    let mut chunk_tx: Option<mpsc::Sender<CapturedAudioFrame>> = None;
    let mut silence_watchdog = SilenceWatchdog::new(in_sample_rate as usize * 2);

    let mut visualizer = AudioVisualiser::new(in_sample_rate);

    fn handle_frame(
        samples: &[f32],
        recording: bool,
        vad: &Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
        recording_buffer: &mut RecordedAudioBuffer,
        chunk_tx: &Option<mpsc::Sender<CapturedAudioFrame>>,
    ) {
        if !recording {
            return;
        }

        if let Some(vad_arc) = vad {
            let mut det = vad_arc.lock().unwrap();
            match det.push_frame(samples).unwrap_or(VadFrame::Speech(samples)) {
                VadFrame::Speech(buf) => record_captured_frame(
                    CapturedAudioFrame {
                        samples: buf.to_vec(),
                        is_speech: true,
                    },
                    recording_buffer,
                    chunk_tx,
                ),
                VadFrame::Noise => record_captured_frame(
                    CapturedAudioFrame {
                        samples: samples.to_vec(),
                        is_speech: false,
                    },
                    recording_buffer,
                    chunk_tx,
                ),
            }
        } else {
            record_captured_frame(
                CapturedAudioFrame {
                    samples: samples.to_vec(),
                    is_speech: true,
                },
                recording_buffer,
                chunk_tx,
            );
        }
    }

    loop {
        // commands before audio — shutdown must not queue behind a backlog
        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                Cmd::Start(tx) => {
                    debug!("Cmd::Start received, chunk_tx is_some: {}", tx.is_some());
                    recorded_audio.clear();
                    recording = true;
                    chunk_tx = tx;
                    visualizer.reset();
                    silence_watchdog.reset();
                    if let Some(v) = &vad {
                        v.lock().unwrap().reset();
                    }
                }
                Cmd::Stop(reply_tx) => {
                    debug!("Cmd::Stop received");
                    recording = false;

                    frame_resampler.finish(&mut |frame: &[f32]| {
                        handle_frame(frame, true, &vad, &mut recorded_audio, &chunk_tx)
                    });

                    let captured = recorded_audio.take_recording();
                    let sample_count = captured.samples.len();
                    let audio_duration_secs = sample_count as f32 / 16_000.0;
                    debug!(
                        "AudioRecorder stop: returning {} samples ({:.1}s of audio)",
                        sample_count, audio_duration_secs
                    );

                    let _ = reply_tx.send(captured);
                    chunk_tx = None;
                }
                Cmd::Shutdown => return,
            }
        }

        // timeout so shutdown lands even when an unresponsive device sends no samples
        let raw = match sample_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(s) => s,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(Cmd::Shutdown) = cmd_rx.try_recv() {
                    return;
                }
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };

        if let Some(callback) = &level_cb {
            if let Some(level) = visualizer.recording_level(&raw, recording) {
                callback(level);
            }
        }

        if recording && silence_watchdog.observe(&raw) {
            debug!("Recording received only digital silence so far");
            if let Some(callback) = &silence_cb {
                callback();
            }
        }

        frame_resampler.push(&raw, &mut |frame: &[f32]| {
            handle_frame(frame, recording, &vad, &mut recorded_audio, &chunk_tx)
        });
    }
}

#[cfg(test)]
#[path = "recorder/tests.rs"]
mod tests;
