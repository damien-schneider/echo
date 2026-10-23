//! Voxtral Mini 4B Realtime for meetings: which machines run it, and the stream that turns 16 kHz
//! audio into timed text.

use anyhow::{Context, Result};
use log::warn;
use std::path::Path;
use transcribe_cpp::{
    CommitPolicy, Model, RunOptions, Session, Stream, StreamExtension, StreamOptions,
    VoxtralRealtimeStreamOptions,
};

use super::meeting_types::{samples_to_ms, AudioSource};
use crate::audio_toolkit::audio::WavWindows;

/// 480 ms: Voxtral's 80 ms token grid times the six delay tokens of the stream.
pub(super) const FEED_SAMPLES: usize = 7_680;
const STREAM_DELAY_MS: i64 = 480;
const MIN_VOXTRAL_MEMORY_BYTES: u64 = 16 * 1024 * 1024 * 1024;

pub fn voxtral_supported() -> bool {
    cfg!(all(target_os = "macos", target_arch = "aarch64"))
        && physical_memory_bytes() >= MIN_VOXTRAL_MEMORY_BYTES
}

#[cfg(target_os = "macos")]
fn physical_memory_bytes() -> u64 {
    let mut bytes: u64 = 0;
    let mut size = std::mem::size_of::<u64>();
    // SAFETY: hw.memsize is a u64 and `size` is the size of the buffer it is written to.
    let status = unsafe {
        libc::sysctlbyname(
            c"hw.memsize".as_ptr(),
            std::ptr::addr_of_mut!(bytes).cast(),
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if status == 0 {
        bytes
    } else {
        0
    }
}

#[cfg(not(target_os = "macos"))]
fn physical_memory_bytes() -> u64 {
    0
}

/// Times are in the source file's own timeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct TimedChunk {
    pub(super) start_ms: i64,
    pub(super) end_ms: i64,
    pub(super) text: String,
}

/// An incomplete source lost audio on the way, so its text must not replace Whisper's pass.
#[derive(Debug)]
pub(super) struct SourceTranscript {
    pub(super) source: AudioSource,
    pub(super) chunks: Vec<TimedChunk>,
    pub(super) complete: bool,
}

impl SourceTranscript {
    pub(super) fn incomplete(source: AudioSource) -> Self {
        Self {
            source,
            chunks: Vec::new(),
            complete: false,
        }
    }
}

/// Voxtral reports no timestamps: text committed once `fed_ms` of audio went in was heard up to
/// one stream delay earlier, and never before the previous chunk ended.
pub(super) fn chunk_span(previous_end_ms: i64, fed_ms: i64) -> (i64, i64) {
    let end_ms = fed_ms - STREAM_DELAY_MS;
    (previous_end_ms.max(end_ms - STREAM_DELAY_MS), end_ms)
}

fn stream_options() -> StreamOptions {
    StreamOptions {
        commit_policy: CommitPolicy::Auto,
        stable_prefix_agreement_n: 1,
        family: Some(StreamExtension::VoxtralRealtime(
            VoxtralRealtimeStreamOptions {
                num_delay_tokens: Some(6),
                min_decode_interval_ms: Some(0),
            },
        )),
    }
}

/// Committed text is append-only, so each change is a new suffix with its own time span.
pub(super) struct TimedStream<'session> {
    stream: Stream<'session>,
    committed_len: usize,
    fed_samples: usize,
    last_end_ms: i64,
}

impl<'session> TimedStream<'session> {
    pub(super) fn begin(session: &'session mut Session) -> Result<Self> {
        let stream = session
            .stream(&RunOptions::default(), &stream_options())
            .context("begin Voxtral stream")?;
        Ok(Self {
            stream,
            committed_len: 0,
            fed_samples: 0,
            last_end_ms: 0,
        })
    }

    /// A piece shorter than [`FEED_SAMPLES`] is padded with silence to stay on the token grid.
    pub(super) fn feed(&mut self, piece: &[f32]) -> Result<Option<TimedChunk>> {
        let update = if piece.len() == FEED_SAMPLES {
            self.stream.feed(piece)
        } else {
            let mut padded = piece.to_vec();
            padded.resize(FEED_SAMPLES, 0.0);
            self.stream.feed(&padded)
        }
        .context("feed Voxtral stream")?;
        self.fed_samples += FEED_SAMPLES;
        Ok(if update.committed_changed {
            self.take_committed()
        } else {
            None
        })
    }

    pub(super) fn finalize(&mut self) -> Result<Option<TimedChunk>> {
        self.stream.finalize().context("finalize Voxtral stream")?;
        Ok(self.take_committed())
    }

    pub(super) fn fed_ms(&self) -> i64 {
        samples_to_ms(self.fed_samples)
    }

    fn take_committed(&mut self) -> Option<TimedChunk> {
        let committed = self.stream.text().committed;
        let suffix = committed.get(self.committed_len..)?.to_string();
        self.committed_len = committed.len();
        if suffix.is_empty() {
            return None;
        }
        let (start_ms, end_ms) = chunk_span(self.last_end_ms, self.fed_ms());
        self.last_end_ms = end_ms;
        Some(TimedChunk {
            start_ms,
            end_ms,
            text: suffix,
        })
    }
}

/// Retranscribe runs every source through the same stream a live meeting uses.
pub(super) fn transcribe_file(
    model: &Model,
    audio: &Path,
    source: AudioSource,
    on_fed_ms: &mut dyn FnMut(i64),
) -> SourceTranscript {
    match stream_file(model, audio, on_fed_ms) {
        Ok(chunks) => SourceTranscript {
            source,
            chunks,
            complete: true,
        },
        Err(e) => {
            warn!(
                "Voxtral could not transcribe {}, Whisper takes it: {e:#}",
                audio.display()
            );
            SourceTranscript::incomplete(source)
        }
    }
}

fn stream_file(
    model: &Model,
    audio: &Path,
    on_fed_ms: &mut dyn FnMut(i64),
) -> Result<Vec<TimedChunk>> {
    let mut session = model.session().context("open Voxtral session")?;
    let mut chunks = Vec::new();
    {
        let mut stream = TimedStream::begin(&mut session)?;
        for window in WavWindows::open(audio, FEED_SAMPLES)? {
            chunks.extend(stream.feed(&window?)?);
            on_fed_ms(stream.fed_ms());
        }
        chunks.extend(stream.finalize()?);
    }
    anyhow::ensure!(
        !session.was_truncated(),
        "the recording runs past Voxtral's ~2.9 h decoder limit"
    );
    Ok(chunks)
}

#[cfg(test)]
mod tests {
    use super::chunk_span;

    #[test]
    fn a_chunk_covers_the_delay_window_before_the_audio_fed() {
        assert_eq!(chunk_span(0, 26_400), (25_440, 25_920));
    }

    #[test]
    fn a_chunk_never_starts_before_the_previous_one_ended() {
        assert_eq!(chunk_span(25_800, 26_400), (25_800, 25_920));
    }
}
