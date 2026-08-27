use anyhow::{Context, Result};
use hound::{WavReader, WavSpec, WavWriter};
use log::debug;
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;

pub fn load_wav_file<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let reader = WavReader::open(file_path.as_ref())
        .with_context(|| format!("Failed to open WAV file: {:?}", file_path.as_ref()))?;

    let spec = reader.spec();

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

/// Every recording Echo writes shares this format; readers assume it.
const SPEC: WavSpec = WavSpec {
    channels: 1,
    sample_rate: 16000,
    bits_per_sample: 16,
    sample_format: hound::SampleFormat::Int,
};

pub type WavSink = WavWriter<BufWriter<File>>;

pub fn create_wav_file<P: AsRef<Path>>(file_path: P) -> Result<WavSink> {
    WavWriter::create(file_path.as_ref(), SPEC)
        .with_context(|| format!("Failed to create WAV file: {:?}", file_path.as_ref()))
}

pub fn write_wav_samples(writer: &mut WavSink, samples: &[f32]) -> Result<()> {
    for sample in samples {
        writer.write_sample((sample * i16::MAX as f32) as i16)?;
    }
    Ok(())
}

pub fn save_wav_file<P: AsRef<Path>>(file_path: P, samples: &[f32]) -> Result<()> {
    let mut writer = create_wav_file(file_path.as_ref())?;
    write_wav_samples(&mut writer, samples)?;
    writer.finalize()?;
    debug!("Saved WAV file: {:?}", file_path.as_ref());
    Ok(())
}

/// Reads a recording in fixed windows so a caller that only needs a sliding view of an hours-long
/// file never materializes the whole thing.
pub struct WavWindows {
    reader: WavReader<BufReader<File>>,
    window: usize,
}

impl WavWindows {
    pub fn open<P: AsRef<Path>>(file_path: P, window: usize) -> Result<Self> {
        anyhow::ensure!(window > 0, "WAV window must hold at least one sample");
        let reader = WavReader::open(file_path.as_ref())
            .with_context(|| format!("Failed to open WAV file: {:?}", file_path.as_ref()))?;
        Ok(Self { reader, window })
    }

    pub fn total_samples(&self) -> usize {
        self.reader.duration() as usize
    }
}

impl Iterator for WavWindows {
    type Item = Result<Vec<f32>>;

    fn next(&mut self) -> Option<Self::Item> {
        match read_samples(&mut self.reader, self.window) {
            Ok(samples) if samples.is_empty() => None,
            other => Some(other),
        }
    }
}

/// `start`/`end` are sample offsets in the file, matching the timeline the writer produced.
pub fn read_wav_range<P: AsRef<Path>>(file_path: P, start: usize, end: usize) -> Result<Vec<f32>> {
    let mut reader = WavReader::open(file_path.as_ref())
        .with_context(|| format!("Failed to open WAV file: {:?}", file_path.as_ref()))?;
    reader.seek(start as u32)?;
    read_samples(&mut reader, end.saturating_sub(start))
}

fn read_samples(reader: &mut WavReader<BufReader<File>>, count: usize) -> Result<Vec<f32>> {
    let spec = reader.spec();
    match spec.sample_format {
        hound::SampleFormat::Int => {
            let max_value = (1 << (spec.bits_per_sample - 1)) as f32;
            reader
                .samples::<i32>()
                .take(count)
                .map(|s| Ok(s? as f32 / max_value))
                .collect()
        }
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .take(count)
            .map(|s| Ok(s?))
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(len: usize) -> Vec<f32> {
        (0..len).map(|i| (i % 100) as f32 / 200.0).collect()
    }

    #[test]
    fn windows_and_ranges_read_back_what_was_written() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("tone.wav");
        let written = tone(2500);
        save_wav_file(&path, &written).unwrap();

        let windows = WavWindows::open(&path, 1000).unwrap();
        assert_eq!(windows.total_samples(), 2500);
        let sizes: Vec<usize> = WavWindows::open(&path, 1000)
            .unwrap()
            .map(|w| w.unwrap().len())
            .collect();
        assert_eq!(sizes, vec![1000, 1000, 500]);

        let joined: Vec<f32> = WavWindows::open(&path, 1000)
            .unwrap()
            .flat_map(|w| w.unwrap())
            .collect();
        assert_eq!(joined.len(), written.len());
        assert!(joined
            .iter()
            .zip(&written)
            .all(|(read, source)| (read - source).abs() < 0.001));

        let range = read_wav_range(&path, 1200, 1210).unwrap();
        assert_eq!(range.len(), 10);
        assert!((range[0] - written[1200]).abs() < 0.001);

        assert!(read_wav_range(&path, 2500, 2600).unwrap().is_empty());
    }
}
