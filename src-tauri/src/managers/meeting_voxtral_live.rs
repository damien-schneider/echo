//! One recording source streamed through Voxtral while the meeting runs: live lines for the page,
//! and the timed text the stop pass keeps instead of decoding the source again.

use anyhow::{Context, Result};
use log::{info, warn};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::Duration;
use transcribe_cpp::{Model, Session};

use super::meeting_streaming::{rms, StreamingSource, SILENCE_RMS_THRESHOLD};
use super::meeting_types::{AudioSource, SAMPLE_RATE};
use super::meeting_voxtral::{SourceTranscript, TimedChunk, TimedStream, FEED_SAMPLES};
use super::streaming::PipelineEvent;

/// Past a minute behind, the live text is no longer live and the stop pass would wait on it.
const MAX_BACKLOG_SAMPLES: usize = 60 * SAMPLE_RATE;
/// Draining the tail of a source after stop runs at several times real time.
const STOP_BUDGET: Duration = Duration::from_secs(60);
const LINE_SILENCE_CLOSE_MS: i64 = 1_200;
const LINE_MAX_SPAN_MS: i64 = 15_000;
const LINE_HARD_MAX_SPAN_MS: i64 = 2 * LINE_MAX_SPAN_MS;
const FEED_MS: i64 = (FEED_SAMPLES * 1000 / SAMPLE_RATE) as i64;

enum Cmd {
    Audio(Vec<f32>),
    Finish,
}

pub struct VoxtralWorker {
    cmd_tx: mpsc::Sender<Cmd>,
    queued_samples: Arc<AtomicUsize>,
    accepting: Arc<AtomicBool>,
}

pub struct VoxtralWorkerHandle {
    cmd_tx: mpsc::Sender<Cmd>,
    accepting: Arc<AtomicBool>,
    result_rx: mpsc::Receiver<SourceTranscript>,
    source: StreamingSource,
}

pub(super) type LiveEventSink = Box<dyn Fn(Vec<PipelineEvent>) + Send>;

struct SourceStream {
    meeting_id: i64,
    source: StreamingSource,
    model_path: PathBuf,
    emit: LiveEventSink,
    cmd_rx: mpsc::Receiver<Cmd>,
    queued_samples: Arc<AtomicUsize>,
    accepting: Arc<AtomicBool>,
}

impl VoxtralWorker {
    pub(super) fn spawn(
        meeting_id: i64,
        source: StreamingSource,
        model_path: PathBuf,
        emit: LiveEventSink,
    ) -> std::io::Result<(Arc<Self>, VoxtralWorkerHandle)> {
        let (cmd_tx, cmd_rx) = mpsc::channel();
        let (result_tx, result_rx) = mpsc::channel();
        let queued_samples = Arc::new(AtomicUsize::new(0));
        let accepting = Arc::new(AtomicBool::new(true));
        let stream = SourceStream {
            meeting_id,
            source,
            model_path,
            emit,
            cmd_rx,
            queued_samples: queued_samples.clone(),
            accepting: accepting.clone(),
        };
        thread::Builder::new()
            .name(format!("meeting-voxtral-{meeting_id}"))
            .spawn(move || {
                let _ = result_tx.send(stream.run());
            })?;
        let worker = Arc::new(Self {
            cmd_tx: cmd_tx.clone(),
            queued_samples,
            accepting: accepting.clone(),
        });
        let handle = VoxtralWorkerHandle {
            cmd_tx,
            accepting,
            result_rx,
            source,
        };
        Ok((worker, handle))
    }

    /// 16 kHz mono f32. No-op once the source stopped taking audio.
    pub(super) fn push_audio(&self, samples: Vec<f32>) {
        if samples.is_empty() || !self.accepting.load(Ordering::Relaxed) {
            return;
        }
        self.queued_samples
            .fetch_add(samples.len(), Ordering::Relaxed);
        let _ = self.cmd_tx.send(Cmd::Audio(samples));
    }
}

impl VoxtralWorkerHandle {
    /// Waits for the queued tail to be transcribed; past the budget the source counts as lost.
    pub(super) fn stop(self) -> SourceTranscript {
        let _ = self.cmd_tx.send(Cmd::Finish);
        let transcript = self.result_rx.recv_timeout(STOP_BUDGET);
        self.accepting.store(false, Ordering::Relaxed);
        transcript.unwrap_or_else(|_| {
            warn!("Voxtral did not finish its stream within {STOP_BUDGET:?}, Whisper takes it");
            SourceTranscript::incomplete(audio_source(self.source))
        })
    }
}

impl SourceStream {
    fn run(self) -> SourceTranscript {
        let source = audio_source(self.source);
        let outcome = Model::load(&self.model_path)
            .context("load Voxtral model")
            .and_then(|model| self.stream_until_finish(&model));
        match outcome {
            Ok(chunks) => SourceTranscript {
                source,
                chunks,
                complete: true,
            },
            Err(e) => {
                warn!(
                    "Voxtral {} stream is incomplete, Whisper transcribes it at stop: {e:#}",
                    source.as_str()
                );
                self.accepting.store(false, Ordering::Relaxed);
                while let Ok(Cmd::Audio(_)) = self.cmd_rx.recv() {}
                SourceTranscript::incomplete(source)
            }
        }
    }

    fn stream_until_finish(&self, model: &Model) -> Result<Vec<TimedChunk>> {
        let mut session = model.session().context("open Voxtral session")?;
        info!(
            "Voxtral live stream started for meeting {} ({})",
            self.meeting_id,
            audio_source(self.source).as_str()
        );
        let mut line = LiveLine::default();
        let streamed = self.feed_until_finish(&mut session, &mut line);
        (self.emit)(line.close());
        let chunks = streamed?;
        anyhow::ensure!(
            !session.was_truncated(),
            "the meeting ran past Voxtral's ~2.9 h decoder limit"
        );
        Ok(chunks)
    }

    fn feed_until_finish(
        &self,
        session: &mut Session,
        line: &mut LiveLine,
    ) -> Result<Vec<TimedChunk>> {
        let mut stream = TimedStream::begin(session)?;
        let mut chunks = Vec::new();
        let mut pending: Vec<f32> = Vec::with_capacity(FEED_SAMPLES * 2);
        while let Ok(Cmd::Audio(samples)) = self.cmd_rx.recv() {
            let backlog = self
                .queued_samples
                .fetch_sub(samples.len(), Ordering::Relaxed);
            anyhow::ensure!(
                backlog <= MAX_BACKLOG_SAMPLES,
                "fell {}s behind the recording",
                backlog / SAMPLE_RATE
            );
            pending.extend(samples);
            while pending.len() >= FEED_SAMPLES {
                let piece: Vec<f32> = pending.drain(..FEED_SAMPLES).collect();
                let chunk = stream.feed(&piece)?;
                (self.emit)(line.fed(chunk.as_ref(), rms(&piece)));
                chunks.extend(chunk);
            }
        }
        let tail = if pending.is_empty() {
            None
        } else {
            stream.feed(&pending)?
        };
        for chunk in tail.into_iter().chain(stream.finalize()?) {
            (self.emit)(line.fed(Some(&chunk), 0.0));
            chunks.push(chunk);
        }
        Ok(chunks)
    }
}

fn audio_source(source: StreamingSource) -> AudioSource {
    match source {
        StreamingSource::Mic => AudioSource::Mic,
        StreamingSource::System => AudioSource::System,
    }
}

/// The open line grows with each chunk and is handed over as final at a pause, once it spans
/// 15 s and the next chunk starts a new word, or at 30 s for scripts written without spaces.
#[derive(Default)]
struct LiveLine {
    open: Option<TimedChunk>,
    silent_ms: i64,
}

impl LiveLine {
    fn fed(&mut self, chunk: Option<&TimedChunk>, piece_rms: f32) -> Vec<PipelineEvent> {
        let mut events = Vec::new();
        if let Some(chunk) = chunk {
            let starts_word = chunk.text.starts_with(char::is_whitespace);
            if (starts_word && self.spans_at_least(LINE_MAX_SPAN_MS))
                || self.spans_at_least(LINE_HARD_MAX_SPAN_MS)
            {
                events.extend(self.close());
            }
            let line = self.open.get_or_insert_with(|| TimedChunk {
                start_ms: chunk.start_ms,
                end_ms: chunk.end_ms,
                text: String::new(),
            });
            line.text.push_str(&chunk.text);
            line.end_ms = chunk.end_ms;
            events.push(PipelineEvent::Interim {
                committed_text: line.text.trim().to_string(),
                tentative_text: String::new(),
                segment_start_ms: as_event_ms(line.start_ms),
            });
            self.silent_ms = 0;
        }
        self.silent_ms = if piece_rms < SILENCE_RMS_THRESHOLD {
            self.silent_ms + FEED_MS
        } else {
            0
        };
        if self.silent_ms >= LINE_SILENCE_CLOSE_MS {
            events.extend(self.close());
        }
        events
    }

    fn spans_at_least(&self, span_ms: i64) -> bool {
        self.open
            .as_ref()
            .is_some_and(|line| line.end_ms - line.start_ms >= span_ms)
    }

    fn close(&mut self) -> Vec<PipelineEvent> {
        let Some(line) = self.open.take() else {
            return Vec::new();
        };
        let text = line.text.trim();
        if text.is_empty() {
            return Vec::new();
        }
        vec![PipelineEvent::Final {
            text: text.to_string(),
            start_ms: as_event_ms(line.start_ms),
            end_ms: as_event_ms(line.end_ms),
        }]
    }
}

fn as_event_ms(ms: i64) -> u64 {
    u64::try_from(ms).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPEECH_RMS: f32 = 1.0;

    fn final_lines(texts: &[&str]) -> Vec<(String, i64)> {
        let mut line = LiveLine::default();
        let fed_ms = |index: usize| i64::try_from(index).unwrap() * FEED_MS;
        texts
            .iter()
            .enumerate()
            .flat_map(|(index, text)| {
                let chunk = TimedChunk {
                    start_ms: fed_ms(index),
                    end_ms: fed_ms(index + 1),
                    text: (*text).to_string(),
                };
                line.fed(Some(&chunk), SPEECH_RMS)
            })
            .filter_map(|event| match event {
                PipelineEvent::Final {
                    text,
                    start_ms,
                    end_ms,
                } => Some((text, i64::try_from(end_ms - start_ms).unwrap())),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn a_long_line_closes_between_words() {
        let texts: Vec<&str> = (0..80)
            .map(|i| if i % 2 == 0 { " mo" } else { "t" })
            .collect();

        let finals = final_lines(&texts);

        assert!(!finals.is_empty());
        assert!(finals
            .iter()
            .all(|(text, _)| text.split_whitespace().all(|word| word == "mot")));
    }

    #[test]
    fn a_line_without_spaces_closes_at_thirty_seconds() {
        let finals = final_lines(&["字"; 80]);

        let (_, span_ms) = &finals[0];
        assert!((LINE_HARD_MAX_SPAN_MS..LINE_HARD_MAX_SPAN_MS + FEED_MS).contains(span_ms));
    }
}
