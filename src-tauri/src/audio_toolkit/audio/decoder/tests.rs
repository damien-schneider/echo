use super::*;
use std::f64::consts::TAU;
use symphonia::core::audio::{Channels, SignalSpec};

const TONE_HZ: f64 = 440.0;
const TONE_AMPLITUDE: f32 = 0.5;

fn write_one_second_tone_wav(path: &Path, sample_rate: u32, channel_gains: &[f32]) {
    let spec = hound::WavSpec {
        channels: channel_gains.len() as u16,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec).expect("create wav");
    for frame in 0..sample_rate {
        let tone = (TAU * TONE_HZ * f64::from(frame) / f64::from(sample_rate)).sin() as f32;
        for gain in channel_gains {
            let sample = gain * TONE_AMPLITUDE * tone * f32::from(i16::MAX);
            writer.write_sample(sample as i16).expect("write sample");
        }
    }
    writer.finalize().expect("finalize wav");
}

fn tone_amplitude_at_16khz(samples: &[f32]) -> f32 {
    let (mut in_phase, mut quadrature) = (0.0_f64, 0.0_f64);
    for (frame, &sample) in samples.iter().enumerate() {
        let angle = TAU * TONE_HZ * frame as f64 / f64::from(TARGET_SAMPLE_RATE);
        in_phase += f64::from(sample) * angle.sin();
        quadrature += f64::from(sample) * angle.cos();
    }
    (2.0 * in_phase.hypot(quadrature) / samples.len() as f64) as f32
}

fn assert_one_second_tone(samples: &[f32], amplitude: f32) {
    let one_second = TARGET_SAMPLE_RATE as usize;
    assert!(
        samples.len().abs_diff(one_second) <= one_second / 100,
        "expected about {one_second} samples, got {}",
        samples.len()
    );
    let measured = tone_amplitude_at_16khz(samples);
    assert!(
        (measured - amplitude).abs() < amplitude * 0.1,
        "expected a {TONE_HZ} Hz tone at amplitude {amplitude}, measured {measured}"
    );
}

#[test]
fn a_44_1khz_mono_wav_decodes_to_an_audible_16khz_tone() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("tone.wav");
    write_one_second_tone_wav(&path, 44_100, &[1.0]);

    let samples = decode_audio_file(&path).expect("decode 44.1 kHz wav");

    assert_one_second_tone(&samples, TONE_AMPLITUDE);
}

#[test]
fn a_48khz_stereo_wav_decodes_to_an_audible_16khz_mono_tone() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("tone.wav");
    write_one_second_tone_wav(&path, 48_000, &[1.0, 1.0]);

    let samples = decode_audio_file(&path).expect("decode 48 kHz wav");

    assert_one_second_tone(&samples, TONE_AMPLITUDE);
}

#[test]
fn a_left_only_stereo_file_decoded_by_symphonia_keeps_its_tone_at_half_level() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("tone.wav");
    write_one_second_tone_wav(&path, TARGET_SAMPLE_RATE, &[1.0, 0.0]);

    let samples = decode_with_symphonia(&path).expect("decode stereo file");

    assert_one_second_tone(&samples, TONE_AMPLITUDE / 2.0);
}

#[test]
fn planar_stereo_frames_are_averaged_per_frame() {
    let spec = SignalSpec::new(
        TARGET_SAMPLE_RATE,
        Channels::FRONT_LEFT | Channels::FRONT_RIGHT,
    );
    let mut buffer = AudioBuffer::<f32>::new(4, spec);
    buffer.render_reserved(Some(4));
    buffer.chan_mut(0).fill(0.5);
    buffer.chan_mut(1).fill(-0.25);

    let mut mono = Vec::new();
    append_mono_frames(&buffer, &mut mono, |sample| sample);

    assert_eq!(mono, vec![0.125; 4]);
}

#[test]
fn a_full_scale_24_bit_sample_is_as_loud_as_full_scale_in_any_other_depth() {
    assert!((s24_level(i24::MAX) - 1.0).abs() < 1e-3);
    assert!((s24_level(i24::MIN) + 1.0).abs() < 1e-3);
}

#[test]
fn ffmpeg_bin_has_exe_suffix_only_on_windows() {
    if cfg!(windows) {
        assert_eq!(FFMPEG_BIN, "ffmpeg.exe");
    } else {
        assert_eq!(FFMPEG_BIN, "ffmpeg");
    }
}

#[test]
fn ffmpeg_common_paths_are_absolute_and_non_empty() {
    let paths = ffmpeg_common_paths();
    assert!(!paths.is_empty(), "current platform must list fallbacks");
    for p in paths {
        assert!(
            std::path::Path::new(p).is_absolute(),
            "fallback path must be absolute: {p}"
        );
    }
}

#[test]
fn find_ffmpeg_never_panics() {
    match find_ffmpeg() {
        Ok(path) => assert!(!path.is_empty()),
        Err(e) => assert!(e.to_string().contains("FFmpeg not found")),
    }
}

#[test]
fn audio_format_extension_match_is_case_insensitive() {
    assert!(matches!(
        AudioFormat::from_path("clip.WAV"),
        AudioFormat::Wav
    ));
    assert!(matches!(
        AudioFormat::from_path("clip.Mp3"),
        AudioFormat::Mp3
    ));
    assert!(matches!(
        AudioFormat::from_path("recording.MP4"),
        AudioFormat::Video
    ));
    assert!(matches!(
        AudioFormat::from_path("notes.txt"),
        AudioFormat::Unsupported
    ));
}
