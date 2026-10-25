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

use super::meeting_streaming::StreamingSource;
use super::meeting_types::AudioSource;
use super::meeting_voxtral::{SourceTranscript, TimedChunk, TimedStream, FEED_SAMPLES};
use super::streaming::PipelineEvent;
use crate::audio_toolkit::constants::SAMPLE_RATE;
use crate::audio_toolkit::vad::SpeechFrames;

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

/// Without `speech` a pause goes unheard: lines close only once they span long enough.
pub(super) struct LiveSource {
    pub(super) meeting_id: i64,
    pub(super) source: StreamingSource,
    pub(super) model_path: PathBuf,
    pub(super) emit: LiveEventSink,
    pub(super) speech: Option<SpeechFrames>,
}

struct SourceStream {
    live: LiveSource,
    cmd_rx: mpsc::Receiver<Cmd>,
    queued_samples: Arc<AtomicUsize>,
    accepting: Arc<AtomicBool>,
}

impl VoxtralWorker {
    pub(super) fn spawn(live: LiveSource) -> std::io::Result<(Arc<Self>, VoxtralWorkerHandle)> {
        let (cmd_tx, cmd_rx) = mpsc::channel();
        let (result_tx, result_rx) = mpsc::channel();
        let queued_samples = Arc::new(AtomicUsize::new(0));
        let accepting = Arc::new(AtomicBool::new(true));
        let source = live.source;
        let thread_name = format!(
            "meeting-voxtral-{}-{}",
            live.meeting_id,
            audio_source(source).as_str()
        );
        let stream = SourceStream {
            live,
            cmd_rx,
            queued_samples: queued_samples.clone(),
            accepting: accepting.clone(),
        };
        thread::Builder::new().name(thread_name).spawn(move || {
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
            warn!("Voxtral did not finish its stream within {STOP_BUDGET:?}, the stop pass transcribes it again");
            SourceTranscript::incomplete(audio_source(self.source))
        })
    }
}

impl SourceStream {
    fn run(mut self) -> SourceTranscript {
        let source = audio_source(self.live.source);
        let outcome = Model::load(&self.live.model_path)
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
                    "Voxtral {} stream is incomplete, the stop pass transcribes it again: {e:#}",
                    source.as_str()
                );
                self.accepting.store(false, Ordering::Relaxed);
                while let Ok(Cmd::Audio(_)) = self.cmd_rx.recv() {}
                SourceTranscript::incomplete(source)
            }
        }
    }

    fn stream_until_finish(&mut self, model: &Model) -> Result<Vec<TimedChunk>> {
        let mut session = model.session().context("open Voxtral session")?;
        info!(
            "Voxtral live stream started for meeting {} ({})",
            self.live.meeting_id,
            audio_source(self.live.source).as_str()
        );
        let mut line = LiveLine::default();
        let streamed = self.feed_until_finish(&mut session, &mut line);
        (self.live.emit)(line.close());
        let chunks = streamed?;
        anyhow::ensure!(
            !session.was_truncated(),
            "the meeting ran past Voxtral's ~2.9 h decoder limit"
        );
        Ok(chunks)
    }

    fn feed_until_finish(
        &mut self,
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
                let heard_speech = self.heard_speech(&piece);
                (self.live.emit)(line.fed(chunk.as_ref(), heard_speech));
                chunks.extend(chunk);
            }
        }
        let tail = if pending.is_empty() {
            None
        } else {
            stream.feed(&pending)?
        };
        for chunk in tail.into_iter().chain(stream.finalize()?) {
            (self.live.emit)(line.fed(Some(&chunk), false));
            chunks.push(chunk);
        }
        Ok(chunks)
    }

    fn heard_speech(&mut self, piece: &[f32]) -> bool {
        let Some(speech) = self.live.speech.as_mut() else {
            return true;
        };
        let mut heard = false;
        speech.push(piece, &mut |_, is_speech| heard |= is_speech);
        heard
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
    fn fed(&mut self, chunk: Option<&TimedChunk>, heard_speech: bool) -> Vec<PipelineEvent> {
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
        self.silent_ms = if heard_speech {
            0
        } else {
            self.silent_ms + FEED_MS
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
                line.fed(Some(&chunk), true)
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
