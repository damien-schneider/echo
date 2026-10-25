//! Streaming WAV sink for a meeting: hours of audio land on disk as they arrive, never in memory.

use anyhow::{Context, Result};
use hound::WavReader;
use log::{error, info, warn};
use std::fs::OpenOptions;
use std::io::{BufReader, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::Mutex;

use crate::audio_toolkit::audio::{create_wav_file, write_wav_samples, WavSink};
use crate::audio_toolkit::constants::SAMPLE_RATE;

/// Meetings run for hours with no VAD to compress them: keeping a stream in memory would grow
/// 230 MB an hour per source. Chunks land in the meeting's WAV as they arrive instead.
pub(super) struct MeetingAudioSink {
    /// A kill loses only hound's 8 KiB write buffer (~0.25 s); `seal_interrupted_track` keeps the rest.
    writer: WavSink,
    file_name: String,
    samples_written: usize,
    /// A stream that can no longer be written stops taking samples but keeps what it already has.
    failed: bool,
}

impl MeetingAudioSink {
    pub(super) fn create(dir: &Path, file_name: String) -> Result<Self> {
        let writer = create_wav_file(dir.join(&file_name))?;
        Ok(Self {
            writer,
            file_name,
            samples_written: 0,
            failed: false,
        })
    }

    fn write(&mut self, chunk: &[f32]) -> Result<()> {
        write_wav_samples(&mut self.writer, chunk)?;
        self.samples_written += chunk.len();
        Ok(())
    }

    /// The first dropped chunk is what the user hears about; the rest of a dead stream is silent.
    fn mark_failed(&mut self) -> bool {
        let first = !self.failed;
        self.failed = true;
        first
    }

    /// `None` when nothing was captured — the empty file is removed rather than recorded.
    pub(super) fn finish(self, dir: &Path) -> Option<String> {
        let file_name = self.file_name;
        let samples = self.samples_written;
        if let Err(e) = self.writer.finalize() {
            warn!("Failed to finalize {file_name}: {e:#}");
        }
        if samples == 0 {
            let _ = std::fs::remove_file(dir.join(&file_name));
            return None;
        }
        info!(
            "Meeting audio {file_name} captured {samples} samples ({:.1}s)",
            samples as f32 / SAMPLE_RATE as f32
        );
        Some(file_name)
    }
}

/// A stream that can no longer be written is closed, not retried: the meeting keeps recording
/// whatever else works instead of failing on every chunk for the rest of the session. Returns
/// true on the chunk that broke it — a recording that stops being saved is not a log line.
pub(super) fn write_to_sink(sink: &Mutex<Option<MeetingAudioSink>>, chunk: &[f32]) -> bool {
    let Ok(mut guard) = sink.lock() else {
        return false;
    };
    let Some(open) = guard.as_mut() else {
        return false;
    };
    if open.failed {
        return false;
    }
    let Err(e) = open.write(chunk) else {
        return false;
    };
    error!(
        "{} write failed, dropping the rest of the stream: {e:#}",
        open.file_name
    );
    open.mark_failed()
}

/// A killed sink never wrote its header: the recording is every whole sample that reached the disk.
pub(super) fn seal_interrupted_track(path: &Path) -> Result<usize> {
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .with_context(|| format!("open {}", path.display()))?;
    let file_len = file.metadata()?.len();
    if file_len == 0 {
        return Ok(0);
    }
    let (data_start, frame_bytes) = {
        let mut reader = BufReader::new(&file);
        let spec = WavReader::new(&mut reader)?.spec();
        let frame_bytes = u64::from(spec.channels * spec.bits_per_sample / 8);
        (reader.stream_position()?, frame_bytes)
    };
    let data_len = (file_len - data_start) / frame_bytes * frame_bytes;
    file.set_len(data_start + data_len)?;
    file.seek(SeekFrom::Start(4))?;
    file.write_all(&u32::try_from(data_start + data_len - 8)?.to_le_bytes())?;
    file.seek(SeekFrom::Start(data_start - 4))?;
    file.write_all(&u32::try_from(data_len)?.to_le_bytes())?;
    Ok(usize::try_from(data_len / frame_bytes)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_toolkit::audio::load_wav_file;
    use tempfile::TempDir;

    fn silence(len: usize) -> Vec<f32> {
        vec![0.25; len]
    }

    #[test]
    fn sink_writes_what_it_is_fed_and_drops_an_empty_capture() {
        let dir = TempDir::new().unwrap();
        let mut sink = MeetingAudioSink::create(dir.path(), "written.wav".into()).unwrap();
        sink.write(&[0.5, -0.5]).unwrap();
        sink.write(&[0.25]).unwrap();
        assert_eq!(sink.finish(dir.path()).as_deref(), Some("written.wav"));

        let samples = load_wav_file(dir.path().join("written.wav")).unwrap();
        assert_eq!(samples.len(), 3);
        assert!((samples[0] - 0.5).abs() < 0.001);

        let empty = MeetingAudioSink::create(dir.path(), "empty.wav".into()).unwrap();
        assert_eq!(empty.finish(dir.path()), None);
        assert!(!dir.path().join("empty.wav").exists());
    }

    /// A kill can cut the last write mid-sample; decoders reject the file until that half is dropped.
    #[test]
    fn sealing_a_killed_track_drops_a_sample_cut_in_half() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("torn.wav");
        let mut sink = MeetingAudioSink::create(dir.path(), "torn.wav".into()).unwrap();
        sink.write(&silence(16_000)).unwrap();
        std::mem::forget(sink);
        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(&[0x7f]).unwrap();

        let sealed = seal_interrupted_track(&path).unwrap();
        let mut reader = WavReader::open(&path).unwrap();
        assert!(sealed > 0);
        assert_eq!(reader.duration() as usize, sealed);
        assert!(reader.samples::<i16>().all(|sample| sample.is_ok()));
    }

    /// A full disk fails on every chunk that follows: the user is told once, not 200 times a
    /// minute for the rest of the meeting.
    #[test]
    fn a_dead_stream_is_worth_one_warning_not_one_per_chunk() {
        let dir = TempDir::new().unwrap();
        let mut sink = MeetingAudioSink::create(dir.path(), "dead.wav".into()).unwrap();

        assert!(sink.mark_failed(), "the chunk that failed is the warning");
        assert!(!sink.mark_failed(), "the rest of the dead stream is silent");
    }

    #[test]
    fn a_write_failure_keeps_the_audio_recorded_so_far() {
        let dir = TempDir::new().unwrap();
        let sink = Mutex::new(Some(
            MeetingAudioSink::create(dir.path(), "partial.wav".into()).unwrap(),
        ));
        write_to_sink(&sink, &silence(160));
        sink.lock().unwrap().as_mut().unwrap().failed = true;
        write_to_sink(&sink, &silence(160));

        let finished = sink.lock().unwrap().take().unwrap().finish(dir.path());
        assert_eq!(finished.as_deref(), Some("partial.wav"));
        assert_eq!(
            load_wav_file(dir.path().join("partial.wav")).unwrap().len(),
            160,
            "samples after the failure must not be written, the earlier ones must survive"
        );
    }
}
