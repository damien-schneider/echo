//! End-to-end Sortformer diarization test against a 2-speaker fixture.
//!
//! Skips when either the fixture WAV or the Sortformer ONNX model is absent,
//! so the test stays inert in CI until a maintainer provides both.

use anyhow::Result;
use parakeet_rs::sortformer::{DiarizationConfig, Sortformer};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Deserialize)]
struct Expected {
    segments: Vec<ExpectedSegment>,
    tolerance_ms: i64,
    allow_speaker_relabeling: bool,
}

#[derive(Deserialize)]
struct ExpectedSegment {
    start_ms: i64,
    end_ms: i64,
    speaker_id: i32,
}

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

fn read_wav_mono_16k(path: &PathBuf) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    anyhow::ensure!(
        spec.sample_rate == 16_000 && spec.channels == 1,
        "fixture must be 16 kHz mono, got {} Hz / {} channels",
        spec.sample_rate,
        spec.channels
    );
    let samples = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<Vec<_>, _>>()?,
        hound::SampleFormat::Int => reader
            .samples::<i16>()
            .map(|s| s.map(|v| v as f32 / 32768.0))
            .collect::<Result<Vec<_>, _>>()?,
    };
    Ok(samples)
}

/// Resolve the Sortformer ONNX path from the app's macOS model cache.
/// Returns None on non-macOS or if the model isn't downloaded.
fn sortformer_model_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let candidate = PathBuf::from(home).join(
        "Library/Application Support/com.damien-schneider.echo/models/\
         diarization-sortformer/diar_streaming_sortformer_4spk-v2.onnx",
    );
    candidate.exists().then_some(candidate)
}

#[test]
fn sortformer_diarizes_two_speakers_within_tolerance() -> Result<()> {
    let wav_path = fixture("diarize_two_speakers_30s.wav");
    let expected_path = fixture("diarize_two_speakers_30s.expected.json");

    if !wav_path.exists() || !expected_path.exists() {
        eprintln!(
            "skip: fixture missing ({:?} or {:?})",
            wav_path, expected_path
        );
        return Ok(());
    }

    let Some(model_path) = sortformer_model_path() else {
        eprintln!("skip: Sortformer model not downloaded locally");
        return Ok(());
    };

    let samples = read_wav_mono_16k(&wav_path)?;
    let expected: Expected =
        serde_json::from_str(&std::fs::read_to_string(&expected_path)?)?;

    let mut sortformer = Sortformer::with_config(
        &model_path,
        None,
        DiarizationConfig::callhome(),
    )?;
    let raw = sortformer.diarize(samples, 16_000, 1)?;

    let actual: Vec<(i64, i64, i32)> = raw
        .iter()
        .map(|s| {
            (
                (s.start / 16) as i64,
                (s.end / 16) as i64,
                s.speaker_id as i32,
            )
        })
        .collect();

    assert_eq!(
        actual.len(),
        expected.segments.len(),
        "segment count mismatch: got {:?}, expected {} segments",
        actual,
        expected.segments.len()
    );

    let mut speaker_remap = HashMap::<i32, i32>::new();
    for ((a_start, a_end, a_spk), e) in actual.iter().zip(&expected.segments) {
        let start_diff = (a_start - e.start_ms).abs();
        let end_diff = (a_end - e.end_ms).abs();
        assert!(
            start_diff <= expected.tolerance_ms,
            "start drift {start_diff}ms exceeds {}ms tolerance (actual={a_start}, expected={})",
            expected.tolerance_ms,
            e.start_ms
        );
        assert!(
            end_diff <= expected.tolerance_ms,
            "end drift {end_diff}ms exceeds {}ms tolerance (actual={a_end}, expected={})",
            expected.tolerance_ms,
            e.end_ms
        );

        if expected.allow_speaker_relabeling {
            let mapped = *speaker_remap.entry(*a_spk).or_insert(e.speaker_id);
            assert_eq!(
                mapped, e.speaker_id,
                "inconsistent speaker relabeling: actual speaker {a_spk} first mapped to {mapped}, now expected {}",
                e.speaker_id
            );
        } else {
            assert_eq!(*a_spk, e.speaker_id);
        }
    }

    Ok(())
}
