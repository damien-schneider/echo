use anyhow::{Context, Result};
use hound::{WavReader, WavSpec, WavWriter};
use log::debug;
use std::path::Path;

/// Load audio samples from a WAV file
pub fn load_wav_file<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let reader = WavReader::open(file_path.as_ref())
        .with_context(|| format!("Failed to open WAV file: {:?}", file_path.as_ref()))?;

    let spec = reader.spec();

    // Read samples and convert to f32
    let samples: Vec<f32> = match spec.sample_format {
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

    debug!(
        "Loaded WAV file: {:?} with {} samples",
        file_path.as_ref(),
        samples.len()
    );
    Ok(samples)
}

/// Save audio samples as a WAV file
pub async fn save_wav_file<P: AsRef<Path>>(file_path: P, samples: &[f32]) -> Result<()> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(file_path.as_ref(), spec)?;

    // Convert f32 samples to i16 for WAV
    for sample in samples {
        let sample_i16 = (sample * i16::MAX as f32) as i16;
        writer.write_sample(sample_i16)?;
    }

    writer.finalize()?;
    debug!("Saved WAV file: {:?}", file_path.as_ref());
    Ok(())
}
