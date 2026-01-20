use anyhow::{Context, Result};
use hound::WavReader;
use log::{debug, info, warn};
use std::fs::File;
use std::path::Path;
use std::process::Command;
use symphonia::core::{
    audio::Signal,
    codecs::{DecoderOptions, CODEC_TYPE_NULL},
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};

/// Supported audio formats (including video files with audio tracks)
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

/// Target sample rate for transcription (Whisper requires 16kHz)
const TARGET_SAMPLE_RATE: u32 = 16000;

/// Decode an audio file to 16kHz mono f32 samples
pub fn decode_audio_file<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let format = AudioFormat::from_path(&file_path);

    match format {
        AudioFormat::Wav => decode_wav_file(&file_path),
        AudioFormat::Mp3 | AudioFormat::M4a | AudioFormat::Ogg => {
            decode_with_symphonia(&file_path)
        }
        AudioFormat::Video => {
            // For video files, extract audio using FFmpeg for better codec compatibility
            decode_video_with_ffmpeg(&file_path)
        }
        AudioFormat::Unsupported => Err(anyhow::anyhow!(
            "Unsupported file format. Please provide an audio file (wav, mp3, m4a, ogg) or a video file with an audio track (mp4, mov, mkv, webm)."
        )),
    }
}

/// Decode video files by extracting audio with FFmpeg
/// This provides better codec compatibility than symphonia for video containers
/// Outputs raw PCM directly to stdout for maximum speed (no temp file needed)
fn decode_video_with_ffmpeg<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let path = file_path.as_ref();
    info!("Extracting audio from video file using FFmpeg: {:?}", path);

    // Find FFmpeg - check common locations
    let ffmpeg_path = find_ffmpeg()?;

    // Run FFmpeg to extract audio as raw 16-bit PCM to stdout
    // This is faster than writing to a temp file
    let output = Command::new(&ffmpeg_path)
        .args([
            "-i",
            path.to_str().unwrap_or_default(),
            "-vn", // No video
            "-f",
            "s16le", // Raw 16-bit little-endian PCM
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000", // 16kHz sample rate
            "-ac",
            "1", // Mono
            "-", // Output to stdout
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

    // Convert raw PCM bytes to f32 samples
    let samples = pcm_s16le_to_f32(&output.stdout);

    debug!(
        "Decoded video file via FFmpeg: {:?} -> {} samples at 16kHz mono",
        path,
        samples.len()
    );

    Ok(samples)
}

/// Convert raw 16-bit little-endian PCM bytes to f32 samples
fn pcm_s16le_to_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(2)
        .map(|chunk| {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            sample as f32 / i16::MAX as f32
        })
        .collect()
}

/// Find FFmpeg executable in common locations
fn find_ffmpeg() -> Result<String> {
    // Check if ffmpeg is in PATH
    if let Ok(output) = Command::new("which").arg("ffmpeg").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    // Check common macOS locations
    let common_paths = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ];

    for path in common_paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    Err(anyhow::anyhow!(
        "FFmpeg not found. Please install FFmpeg to process video files.\n\
        On macOS: brew install ffmpeg\n\
        On Windows: Download from https://ffmpeg.org/download.html"
    ))
}

/// Decode WAV file using existing hound library
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

    // Convert to mono if needed
    if spec.channels > 1 {
        samples = stereo_to_mono(samples, spec.channels as usize);
    }

    // Resample if needed
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

/// Decode audio files using Symphonia (MP3, M4A, OGG, etc.)
fn decode_with_symphonia<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let path = file_path.as_ref();

    // Open the file directly (without BufReader)
    let file = File::open(path).with_context(|| format!("Failed to open file: {:?}", path))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // Create a hint to help format registry
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(extension);
    }

    // Probe the format
    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };
    let metadata_opts = MetadataOptions::default();

    let mut probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &metadata_opts)
        .with_context(|| format!("Failed to probe format: {:?}", path))?
        .format;

    // Get the default track
    let track = probed
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| anyhow::anyhow!("No valid audio track found"))?;

    // Create decoder
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .context("Failed to create decoder for track")?;

    // Get sample rate
    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| anyhow::anyhow!("Missing sample rate"))?;

    // Get number of channels
    let channels_count = track.codec_params.channels.map(|c| c.count()).unwrap_or(1);

    // Collect all decoded samples
    let mut all_samples: Vec<f32> = Vec::new();
    let mut decode_errors = 0;
    const MAX_CONSECUTIVE_ERRORS: u32 = 50;
    let mut consecutive_errors = 0;

    loop {
        let packet = match probed.next_packet() {
            Ok(packet) => {
                consecutive_errors = 0; // Reset on successful packet read
                packet
            }
            Err(symphonia::core::errors::Error::ResetRequired) => {
                // Reset required, continue
                continue;
            }
            Err(symphonia::core::errors::Error::IoError(_)) => {
                // End of file or unrecoverable error
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
                consecutive_errors = 0; // Reset on successful decode
                decoded
            }
            Err(symphonia::core::errors::Error::DecodeError(msg)) => {
                // Skip malformed frames - this is common in some AAC streams
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

        // Use the Symphonia API to extract samples
        // AudioBufferRef can be different formats, we need to handle them
        match decoded {
            symphonia::core::audio::AudioBufferRef::F32(buffer) => {
                // Direct f32 samples - iterate through all channels
                for ch in 0..channels_count {
                    let samples = buffer.chan(ch);
                    for &sample in samples {
                        all_samples.push(sample);
                    }
                }
            }
            symphonia::core::audio::AudioBufferRef::S16(buffer) => {
                // i16 samples
                for ch in 0..channels_count {
                    let samples = buffer.chan(ch);
                    for &sample in samples {
                        all_samples.push((sample as f32) / (i16::MAX as f32));
                    }
                }
            }
            symphonia::core::audio::AudioBufferRef::S24(buffer) => {
                // i24 samples (stored in i24 wrapper)
                for ch in 0..channels_count {
                    let samples = buffer.chan(ch);
                    for sample in samples {
                        // i24 is a newtype wrapper, use inner() to get the raw value
                        all_samples.push((sample.inner() as f32) / (i32::MAX as f32));
                    }
                }
            }
            symphonia::core::audio::AudioBufferRef::S32(buffer) => {
                // i32 samples
                for ch in 0..channels_count {
                    let samples = buffer.chan(ch);
                    for &sample in samples {
                        all_samples.push((sample as f32) / (i32::MAX as f32));
                    }
                }
            }
            symphonia::core::audio::AudioBufferRef::U8(buffer) => {
                // u8 samples
                for ch in 0..channels_count {
                    let samples = buffer.chan(ch);
                    for &sample in samples {
                        all_samples.push(((sample as f32) - 128.0) / 128.0);
                    }
                }
            }
            _ => {
                return Err(anyhow::anyhow!("Unsupported audio format"));
            }
        }
    }

    // Check if we got any audio at all
    if all_samples.is_empty() {
        return Err(anyhow::anyhow!(
            "No audio could be decoded from file. The file may be corrupted or use an unsupported codec."
        ));
    }

    // Log if we had to skip some frames
    if decode_errors > 0 {
        warn!(
            "Skipped {} malformed frames while decoding {:?}",
            decode_errors, path
        );
    }

    // Convert to mono if needed
    if channels_count > 1 {
        all_samples = stereo_to_mono(all_samples, channels_count);
    }

    // Resample if needed
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

/// Convert multi-channel audio to mono by averaging channels
fn stereo_to_mono(samples: Vec<f32>, channels: usize) -> Vec<f32> {
    if channels == 1 {
        return samples;
    }

    samples
        .chunks(channels)
        .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
        .collect()
}

/// Resample audio from one sample rate to another using rubato
fn resample_audio(samples: Vec<f32>, from_rate: u32, to_rate: u32) -> Result<Vec<f32>> {
    if from_rate == to_rate {
        return Ok(samples);
    }

    // Calculate resampling parameters
    let ratio = to_rate as f64 / from_rate as f64;

    // Use rubato's FftFixedInOut for faster, high-quality resampling
    use rubato::{FftFixedInOut, Resampler};

    // Calculate chunk size for processing
    let chunk_size = samples.len().min(4096);
    let expected_output = (samples.len() as f64 * ratio).ceil() as usize;

    // Create resampler with appropriate parameters
    let mut resampler = FftFixedInOut::<f64>::new(
        from_rate as usize,
        to_rate as usize,
        chunk_size,
        2, // num_channels (we're working with mono)
    )?;

    // Resample in chunks
    let mut resampled = Vec::with_capacity(expected_output);

    // Convert to f64 for resampler
    let samples_f64: Vec<f64> = samples.iter().map(|&s| s as f64).collect();

    // Process in chunks
    let mut input_offset = 0;
    while input_offset < samples_f64.len() {
        let end = (input_offset + chunk_size).min(samples_f64.len());
        let chunk = &samples_f64[input_offset..end];

        if chunk.is_empty() {
            break;
        }

        // Process chunk - we need to provide input as a slice of slices (channels)
        let input_buffer = vec![chunk];
        match resampler.process(&input_buffer, None) {
            Ok(output) => {
                // output is Vec<Vec<f64>>, one per channel
                for channel_output in output {
                    for sample in channel_output {
                        resampled.push(sample as f32);
                    }
                }
            }
            Err(e) => {
                debug!("Resampling chunk failed: {}", e);
                break;
            }
        }

        input_offset = end;
    }

    // Process any remaining samples in the resampler's internal buffer
    while let Ok(output) = resampler.process(&[&[]], None) {
        if output.is_empty() || output[0].is_empty() {
            break;
        }
        for channel_output in output {
            for sample in channel_output {
                resampled.push(sample as f32);
            }
        }
    }

    debug!(
        "Resampled audio: {} samples at {}Hz -> {} samples at {}Hz",
        samples.len(),
        from_rate,
        resampled.len(),
        to_rate
    );

    Ok(resampled)
}
