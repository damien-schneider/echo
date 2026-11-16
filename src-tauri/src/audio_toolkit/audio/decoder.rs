use anyhow::{Context, Result};
use hound::WavReader;
use log::{debug, info, warn};
use rubato::{FftFixedInOut, Resampler};
use std::fs::File;
use std::path::Path;
use std::process::Command;
use symphonia::core::{
    audio::{AudioBuffer, AudioBufferRef, Signal},
    codecs::{DecoderOptions, CODEC_TYPE_NULL},
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
    sample::{i24, Sample},
};

use crate::audio_toolkit::constants::SAMPLE_RATE;

pub enum AudioFormat {
    Wav,
    Mp3,
    M4a,
    Ogg,
    Video,
    Unsupported,
}

impl AudioFormat {
    pub fn from_path<P: AsRef<Path>>(path: P) -> Self {
        let extension = path
            .as_ref()
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        match extension.as_str() {
            "wav" | "wave" => AudioFormat::Wav,
            "mp3" => AudioFormat::Mp3,
            "m4a" | "aac" => AudioFormat::M4a,
            "ogg" | "oga" => AudioFormat::Ogg,
            "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" => AudioFormat::Video,
            _ => AudioFormat::Unsupported,
        }
    }
}

const TARGET_SAMPLE_RATE: u32 = SAMPLE_RATE as u32;

pub fn decode_audio_file<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let format = AudioFormat::from_path(&file_path);

    match format {
        AudioFormat::Wav => decode_wav_file(&file_path),
        AudioFormat::Mp3 | AudioFormat::M4a | AudioFormat::Ogg => {
            decode_with_symphonia(&file_path)
        }
        AudioFormat::Video => {
            // FFmpeg for codec compat.
            decode_video_with_ffmpeg(&file_path)
        }
        AudioFormat::Unsupported => Err(anyhow::anyhow!(
            "Unsupported file format. Please provide an audio file (wav, mp3, m4a, ogg) or a video file with an audio track (mp4, mov, mkv, webm)."
        )),
    }
}

/// Raw PCM to stdout — no temp file.
fn decode_video_with_ffmpeg<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let path = file_path.as_ref();
    info!("Extracting audio from video file using FFmpeg: {:?}", path);

    let ffmpeg_path = find_ffmpeg()?;
    let sample_rate = SAMPLE_RATE.to_string();

    let output = Command::new(&ffmpeg_path)
        .args([
            "-i",
            path.to_str().unwrap_or_default(),
            "-vn",
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            "-ar",
            sample_rate.as_str(),
            "-ac",
            "1",
            "-",
        ])
        .output()
        .with_context(|| format!("Failed to run FFmpeg: {}", ffmpeg_path))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!(
            "FFmpeg failed to extract audio: {}",
            stderr.lines().last().unwrap_or("Unknown error")
        ));
    }

    info!("FFmpeg audio extraction complete, converting PCM to samples...");

    let samples = pcm_s16le_to_f32(&output.stdout);

    debug!(
        "Decoded video file via FFmpeg: {:?} -> {} samples at 16kHz mono",
        path,
        samples.len()
    );

    Ok(samples)
}

fn pcm_s16le_to_f32(bytes: &[u8]) -> Vec<f32> {
    let (pairs, _) = bytes.as_chunks::<2>();
    pairs
        .iter()
        .map(|&pair| i16::from_le_bytes(pair) as f32 / i16::MAX as f32)
        .collect()
}

const FFMPEG_BIN: &str = if cfg!(windows) {
    "ffmpeg.exe"
} else {
    "ffmpeg"
};

fn ffmpeg_common_paths() -> &'static [&'static str] {
    #[cfg(target_os = "windows")]
    {
        &[
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
            r"C:\ffmpeg\bin\ffmpeg.exe",
        ]
    }
    #[cfg(target_os = "macos")]
    {
        &[
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
        ]
    }
    #[cfg(target_os = "linux")]
    {
        &[
            "/usr/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/snap/bin/ffmpeg",
        ]
    }
}

/// PATH first, then platform-specific common paths.
fn find_ffmpeg() -> Result<String> {
    if Command::new(FFMPEG_BIN)
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Ok(FFMPEG_BIN.to_string());
    }

    let locator = if cfg!(windows) { "where" } else { "which" };
    if let Ok(output) = Command::new(locator).arg("ffmpeg").output() {
        if output.status.success() {
            if let Some(path) = String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::trim)
                .find(|l| !l.is_empty())
            {
                return Ok(path.to_string());
            }
        }
    }

    for path in ffmpeg_common_paths() {
        if std::path::Path::new(path).exists() {
            return Ok((*path).to_string());
        }
    }

    Err(anyhow::anyhow!(
        "FFmpeg not found. Please install FFmpeg to process video files.\n\
        On macOS: brew install ffmpeg\n\
        On Windows: winget install ffmpeg (or download from https://ffmpeg.org/download.html)\n\
        On Linux: sudo apt install ffmpeg"
    ))
}

fn decode_wav_file<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let reader = WavReader::open(file_path.as_ref())
        .with_context(|| format!("Failed to open WAV file: {:?}", file_path.as_ref()))?;

    let spec = reader.spec();
    let mut samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let max_value = (1 << (spec.bits_per_sample - 1)) as f32;
            reader
                .into_samples::<i32>()
                .filter_map(|s| s.ok())
                .map(|s| s as f32 / max_value)
                .collect()
        }
        hound::SampleFormat::Float => reader
            .into_samples::<f32>()
            .filter_map(|s| s.ok())
            .collect(),
    };

    if spec.channels > 1 {
        samples = stereo_to_mono(samples, spec.channels as usize);
    }

    if spec.sample_rate != TARGET_SAMPLE_RATE {
        samples = resample_audio(samples, spec.sample_rate, TARGET_SAMPLE_RATE)?;
    }

    debug!(
        "Decoded WAV file: {:?} - {} samples at {}Hz -> {} samples at 16kHz mono",
        file_path.as_ref(),
        samples.len(),
        spec.sample_rate,
        samples.len()
    );

    Ok(samples)
}

/// MP3, M4A, OGG, etc via Symphonia.
fn decode_with_symphonia<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let path = file_path.as_ref();

    let file = File::open(path).with_context(|| format!("Failed to open file: {:?}", path))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(extension);
    }

    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };
    let metadata_opts = MetadataOptions::default();

    let mut probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &metadata_opts)
        .with_context(|| format!("Failed to probe format: {:?}", path))?
        .format;

    let track = probed
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| anyhow::anyhow!("No valid audio track found"))?;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .context("Failed to create decoder for track")?;

    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| anyhow::anyhow!("Missing sample rate"))?;

    let mut all_samples: Vec<f32> = Vec::new();
    let mut decode_errors = 0;
    const MAX_CONSECUTIVE_ERRORS: u32 = 50;
    let mut consecutive_errors = 0;

    loop {
        let packet = match probed.next_packet() {
            Ok(packet) => {
                consecutive_errors = 0;
                packet
            }
            Err(symphonia::core::errors::Error::ResetRequired) => {
                continue;
            }
            Err(symphonia::core::errors::Error::IoError(_)) => {
                break;
            }
            Err(e) => {
                warn!("Error reading packet: {}", e);
                consecutive_errors += 1;
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    return Err(anyhow::anyhow!(
                        "Too many consecutive errors reading packets: {}",
                        e
                    ));
                }
                continue;
            }
        };

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => {
                consecutive_errors = 0;
                decoded
            }
            Err(symphonia::core::errors::Error::DecodeError(msg)) => {
                // Common in some AAC streams.
                decode_errors += 1;
                if decode_errors == 1 {
                    warn!("Decode error (will skip malformed frames): {}", msg);
                }
                consecutive_errors += 1;
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    return Err(anyhow::anyhow!(
                        "Too many consecutive decode errors: {}",
                        msg
                    ));
                }
                continue;
            }
            Err(symphonia::core::errors::Error::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(e) => {
                warn!("Error decoding packet: {}", e);
                consecutive_errors += 1;
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS {
                    return Err(anyhow::anyhow!("Too many consecutive decode errors: {}", e));
                }
                continue;
            }
        };

        match decoded {
            AudioBufferRef::F32(buffer) => append_mono_frames(&buffer, &mut all_samples, |s| s),
            AudioBufferRef::S16(buffer) => {
                append_mono_frames(&buffer, &mut all_samples, |s| s as f32 / i16::MAX as f32)
            }
            AudioBufferRef::S24(buffer) => append_mono_frames(&buffer, &mut all_samples, s24_level),
            AudioBufferRef::S32(buffer) => {
                append_mono_frames(&buffer, &mut all_samples, |s| s as f32 / i32::MAX as f32)
            }
            AudioBufferRef::U8(buffer) => {
                append_mono_frames(&buffer, &mut all_samples, |s| (s as f32 - 128.0) / 128.0)
            }
            _ => {
                return Err(anyhow::anyhow!("Unsupported audio format"));
            }
        }
    }

    if all_samples.is_empty() {
        return Err(anyhow::anyhow!(
            "No audio could be decoded from file. The file may be corrupted or use an unsupported codec."
        ));
    }

    if decode_errors > 0 {
        warn!(
            "Skipped {} malformed frames while decoding {:?}",
            decode_errors, path
        );
    }

    if sample_rate != TARGET_SAMPLE_RATE {
        all_samples = resample_audio(all_samples, sample_rate, TARGET_SAMPLE_RATE)?;
    }

    debug!(
        "Decoded audio file: {:?} - {} samples at {}Hz -> {} samples at 16kHz mono{}",
        path,
        all_samples.len(),
        sample_rate,
        all_samples.len(),
        if decode_errors > 0 {
            format!(" (skipped {} malformed frames)", decode_errors)
        } else {
            String::new()
        }
    );

    Ok(all_samples)
}

fn append_mono_frames<S: Sample>(
    buffer: &AudioBuffer<S>,
    mono: &mut Vec<f32>,
    to_f32: impl Fn(S) -> f32,
) {
    let channels = buffer.spec().channels.count();
    let gain = 1.0 / channels as f32;
    let start = mono.len();
    mono.resize(start + buffer.frames(), 0.0);

    for channel in 0..channels {
        for (mixed, &sample) in mono[start..].iter_mut().zip(buffer.chan(channel)) {
            *mixed += to_f32(sample) * gain;
        }
    }
}

const S24_FULL_SCALE: f32 = 8_388_608.0;

fn s24_level(sample: i24) -> f32 {
    sample.inner() as f32 / S24_FULL_SCALE
}

fn stereo_to_mono(samples: Vec<f32>, channels: usize) -> Vec<f32> {
    if channels == 1 {
        return samples;
    }

    samples
        .chunks(channels)
        .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
        .collect()
}

const RESAMPLER_CHUNK_FRAMES: usize = 1024;

fn resample_audio(samples: Vec<f32>, from_rate: u32, to_rate: u32) -> Result<Vec<f32>> {
    if from_rate == to_rate {
        return Ok(samples);
    }

    let mut resampler = FftFixedInOut::<f32>::new(
        from_rate as usize,
        to_rate as usize,
        RESAMPLER_CHUNK_FRAMES,
        1,
    )
    .context("Failed to create resampler")?;
    let chunk_frames = resampler.input_frames_next();
    let delay_frames = resampler.output_delay();
    let expected_frames =
        (samples.len() as u64 * u64::from(to_rate) / u64::from(from_rate)) as usize;
    let mut resampled =
        Vec::with_capacity(delay_frames + expected_frames + resampler.output_frames_max());

    let mut chunks = samples.chunks_exact(chunk_frames);
    for chunk in chunks.by_ref() {
        resample_chunk(&mut resampler, chunk, &mut resampled)?;
    }

    let mut padded_tail = chunks.remainder().to_vec();
    while resampled.len() < delay_frames + expected_frames {
        padded_tail.resize(chunk_frames, 0.0);
        resample_chunk(&mut resampler, &padded_tail, &mut resampled)?;
        padded_tail.clear();
    }

    resampled.drain(..delay_frames);
    resampled.truncate(expected_frames);

    debug!(
        "Resampled audio: {} samples at {}Hz -> {} samples at {}Hz",
        samples.len(),
        from_rate,
        resampled.len(),
        to_rate
    );

    Ok(resampled)
}

fn resample_chunk(
    resampler: &mut FftFixedInOut<f32>,
    chunk: &[f32],
    resampled: &mut Vec<f32>,
) -> Result<()> {
    let start = resampled.len();
    resampled.resize(start + resampler.output_frames_next(), 0.0);
    resampler
        .process_into_buffer(&[chunk], &mut [&mut resampled[start..]], None)
        .context("Failed to resample audio")?;
    Ok(())
}

#[cfg(test)]
#[path = "decoder/tests.rs"]
mod tests;
