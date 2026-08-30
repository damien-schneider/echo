//! Streaming WAV sink for a meeting: hours of audio land on disk as they arrive, never in memory.

use anyhow::Result;
use log::{error, info, warn};
use std::path::Path;
use std::sync::Mutex;

use crate::audio_toolkit::audio::{create_wav_file, write_wav_samples, WavSink};
use crate::managers::meeting_types::SAMPLE_RATE;

/// hound only writes the real header on `finalize()`, so a `kill -9` used to leave an hour of PCM
/// behind a zero-length header. Flushing rewrites it: the file stays readable to within 10 s.
const FLUSH_INTERVAL_SAMPLES: usize = 10 * SAMPLE_RATE;

/// Meetings run for hours with no VAD to compress them: keeping a stream in memory would grow
/// 230 MB an hour per source. Chunks land in the meeting's WAV as they arrive instead.
pub(super) struct MeetingAudioSink {
    writer: WavSink,
    file_name: String,
    samples_written: usize,
    samples_since_flush: usize,
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
            samples_since_flush: 0,
            failed: false,
        })
    }

    fn write(&mut self, chunk: &[f32]) -> Result<()> {
        write_wav_samples(&mut self.writer, chunk)?;
        self.samples_written += chunk.len();
        self.samples_since_flush += chunk.len();
        if self.samples_since_flush >= FLUSH_INTERVAL_SAMPLES {
            self.samples_since_flush = 0;
            self.writer.flush()?;
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_toolkit::audio::load_wav_file;
    use hound::WavReader;
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

    /// The crash drill: `finish()` never runs, so only what was flushed survives.
    #[test]
    fn a_killed_recording_is_still_readable_up_to_the_last_flush() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("killed.wav");
        let mut sink = MeetingAudioSink::create(dir.path(), "killed.wav".into()).unwrap();
        sink.write(&silence(2 * FLUSH_INTERVAL_SAMPLES)).unwrap();
        std::mem::forget(sink);

        let readable = WavReader::open(&path).unwrap().duration() as usize;
        assert!(
            readable >= FLUSH_INTERVAL_SAMPLES,
            "expected at least one flushed interval, got {readable} samples"
        );
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
