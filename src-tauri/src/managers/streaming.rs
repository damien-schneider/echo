//! Realtime streaming transcription pipeline.
//!
//! Implements a rolling-window decoder with the LocalAgreement-2 commit
//! strategy from Macháček et al. (2023, "Turning Whisper into Real-Time
//! Transcription System", arXiv 2307.14743). The model is treated as an
//! injected closure so the algorithm itself is fully unit-testable without
//! any runtime model load.
//!
//! Algorithm in one paragraph: the buffer of f32 samples grows as new audio
//! arrives. Once the buffer exceeds a minimum size, every `step_samples` we
//! re-decode the entire buffer. Words that appear at the same position in two
//! consecutive decodes form the "committed" prefix and are emitted as Interim
//! updates the user can rely on; the trailing words are emitted as
//! "tentative" — they may be rewritten by the next decode. When the VAD
//! detects sustained silence, or when the buffer hits its hard cap, the
//! current decode is emitted as a Final segment and the buffer is reset.

use std::time::Duration;

// ── Pure helpers ───────────────────────────────────────────────────────────

/// Tokenize a transcript into words. Punctuation is kept attached so that
/// commit comparisons aren't fooled by Whisper inserting / removing trailing
/// commas; case is preserved.
pub fn split_words(text: &str) -> Vec<String> {
    text.split_whitespace().map(|w| w.to_string()).collect()
}

/// Longest common prefix length between two slices.
pub fn lcp_len<T: PartialEq>(a: &[T], b: &[T]) -> usize {
    a.iter().zip(b.iter()).take_while(|(x, y)| x == y).count()
}

// ── Committer ──────────────────────────────────────────────────────────────

/// Accumulates LocalAgreement-2 state across successive decodes of the same
/// (growing) audio segment. Reset between segments.
#[derive(Debug, Default)]
pub struct LocalAgreementCommitter {
    prev_words: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitDelta {
    /// All words confirmed by LA-2 since the segment started, joined by a
    /// single space.
    pub committed_text: String,
    /// The trailing tail of the latest decode that has not yet agreed with a
    /// second decode. Treat as ephemeral; render in a tentative style.
    pub tentative_text: String,
}

impl LocalAgreementCommitter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed the words from a new decode of the *same* growing segment. Returns
    /// the current committed prefix and the trailing tentative tail.
    pub fn observe(&mut self, curr: Vec<String>) -> CommitDelta {
        let committed_n = match &self.prev_words {
            Some(prev) => lcp_len(prev, &curr),
            None => 0,
        };
        let committed = curr[..committed_n].join(" ");
        let tentative = curr[committed_n..].join(" ");
        self.prev_words = Some(curr);
        CommitDelta {
            committed_text: committed,
            tentative_text: tentative,
        }
    }

    /// Forget all per-segment state — call on silence flush, hard cap, or
    /// stop. After this, the next observe() starts a new LA-2 episode.
    pub fn reset(&mut self) {
        self.prev_words = None;
    }
}

// ── Pipeline ───────────────────────────────────────────────────────────────

/// Tunables for the rolling-window pipeline. All sample counts are at 16 kHz
/// mono so 1 second = 16_000 samples.
#[derive(Debug, Clone, Copy)]
pub struct StreamingConfig {
    /// Buffer must reach this size before the first decode fires.
    pub min_window_samples: usize,
    /// Re-decode every time we accumulate this many new samples.
    pub step_samples: usize,
    /// Hard cap; if reached without a silence flush, force a final commit
    /// and reset the buffer.
    pub max_window_samples: usize,
    /// Sustained silence (in samples) that triggers a final commit.
    pub silence_flush_samples: usize,
}

impl Default for StreamingConfig {
    fn default() -> Self {
        // Tuned for snappy realtime UX on CPU/Metal:
        //   first text after 1s, partials every 1s, finals on 400ms of
        //   trailing silence or every 5s hard cap. Lower cap → bounded
        //   per-decode work even when whisper is slow.
        Self {
            min_window_samples: 16_000,
            step_samples: 16_000,
            max_window_samples: 5 * 16_000,
            silence_flush_samples: (0.4 * 16_000.0) as usize,
        }
    }
}

/// Output emitted by the pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PipelineEvent {
    /// Tentative update for the current in-progress segment. The frontend
    /// should replace any previous Interim for the same `segment_start_ms`.
    Interim {
        committed_text: String,
        tentative_text: String,
        segment_start_ms: u64,
    },
    /// Locked-in segment. Append to the transcript; the same start_ms will
    /// not be revised by future Interim events.
    Final {
        text: String,
        start_ms: u64,
        end_ms: u64,
    },
}

pub struct StreamingPipeline {
    cfg: StreamingConfig,
    buffer: Vec<f32>,
    samples_since_decode: usize,
    silence_run_samples: usize,
    committer: LocalAgreementCommitter,
    /// Wall-clock offset (ms from recording start) of the first sample in the
    /// current buffer.
    segment_start_ms: u64,
    /// Total samples ever pushed (used to compute `segment_start_ms` after
    /// each reset).
    total_samples: u64,
    /// True if any frame in the *current* buffer was classified as speech.
    /// Decoding + flushing are gated on this so we don't waste compute (and
    /// emit duplicate empty Finals) on a buffer that is only silence.
    had_speech_in_buffer: bool,
}

impl StreamingPipeline {
    pub fn new(cfg: StreamingConfig) -> Self {
        Self {
            cfg,
            buffer: Vec::new(),
            samples_since_decode: 0,
            silence_run_samples: 0,
            committer: LocalAgreementCommitter::new(),
            segment_start_ms: 0,
            total_samples: 0,
            had_speech_in_buffer: false,
        }
    }

    fn samples_to_ms(samples: u64) -> u64 {
        samples * 1000 / 16_000
    }

    fn buffer_duration_ms(&self) -> u64 {
        Self::samples_to_ms(self.buffer.len() as u64)
    }

    /// Push a frame of 16 kHz mono f32 audio + a bool indicating whether the
    /// frame is speech (caller is responsible for VAD). The `decode` closure
    /// is called whenever the pipeline wants to ask the model for a fresh
    /// transcript of the current buffer; pass an empty string if the model
    /// returns nothing.
    pub fn push<D: FnMut(&[f32]) -> String>(
        &mut self,
        frame: &[f32],
        is_speech: bool,
        decode: &mut D,
    ) -> Vec<PipelineEvent> {
        if frame.is_empty() {
            return Vec::new();
        }
        self.total_samples += frame.len() as u64;
        self.buffer.extend_from_slice(frame);
        self.samples_since_decode += frame.len();
        if is_speech {
            self.silence_run_samples = 0;
            self.had_speech_in_buffer = true;
        } else {
            self.silence_run_samples += frame.len();
        }

        let mut events = Vec::new();

        // 1) Sustained silence after speech — finalize the current segment.
        // Skip if no speech was seen yet (avoids re-flushing pure silence).
        if self.had_speech_in_buffer
            && self.buffer.len() >= self.cfg.min_window_samples
            && self.silence_run_samples >= self.cfg.silence_flush_samples
        {
            if let Some(ev) = self.finalize_now(decode) {
                events.push(ev);
            }
            return events;
        }

        // 2) Pure-silence buffer past min_window — drop it without decoding.
        // This prevents the buffer from growing indefinitely during a long
        // quiet period (mic muted, user stepped away) and avoids feeding
        // whisper hours of silence.
        if !self.had_speech_in_buffer && self.buffer.len() >= self.cfg.min_window_samples {
            self.buffer.clear();
            self.samples_since_decode = 0;
            self.silence_run_samples = 0;
            self.segment_start_ms = Self::samples_to_ms(self.total_samples);
            return events;
        }

        // 3) Hard cap — force-final to keep latency bounded. Guarded on
        // had_speech so a rare all-silence buffer past max_window doesn't
        // produce an empty Final.
        if self.had_speech_in_buffer && self.buffer.len() >= self.cfg.max_window_samples {
            if let Some(ev) = self.finalize_now(decode) {
                events.push(ev);
            }
            return events;
        }

        // 4) Periodic interim decode (skip if buffer has no speech yet).
        if self.had_speech_in_buffer
            && self.buffer.len() >= self.cfg.min_window_samples
            && self.samples_since_decode >= self.cfg.step_samples
        {
            self.samples_since_decode = 0;
            let text = decode(&self.buffer);
            let words = split_words(&text);
            let delta = self.committer.observe(words);
            events.push(PipelineEvent::Interim {
                committed_text: delta.committed_text,
                tentative_text: delta.tentative_text,
                segment_start_ms: self.segment_start_ms,
            });
        }

        events
    }

    /// Drain whatever is in the buffer as a final segment. Call on stop.
    pub fn flush<D: FnMut(&[f32]) -> String>(&mut self, decode: &mut D) -> Vec<PipelineEvent> {
        if self.buffer.is_empty() {
            return Vec::new();
        }
        match self.finalize_now(decode) {
            Some(ev) => vec![ev],
            None => Vec::new(),
        }
    }

    fn finalize_now<D: FnMut(&[f32]) -> String>(&mut self, decode: &mut D) -> Option<PipelineEvent> {
        let duration_ms = self.buffer_duration_ms();
        let text = decode(&self.buffer);
        let trimmed = text.trim();
        let event = if trimmed.is_empty() {
            None
        } else {
            Some(PipelineEvent::Final {
                text: trimmed.to_string(),
                start_ms: self.segment_start_ms,
                end_ms: self.segment_start_ms + duration_ms,
            })
        };
        // Regardless of whether we emitted, advance segment markers and clear.
        self.buffer.clear();
        self.samples_since_decode = 0;
        self.silence_run_samples = 0;
        self.had_speech_in_buffer = false;
        self.committer.reset();
        self.segment_start_ms = Self::samples_to_ms(self.total_samples);
        event
    }

    /// Visible for tests / observability.
    #[allow(dead_code)]
    pub fn buffer_duration(&self) -> Duration {
        Duration::from_millis(self.buffer_duration_ms())
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── split_words ────────────────────────────────────────────────────────

    #[test]
    fn split_words_empty() {
        assert!(split_words("").is_empty());
        assert!(split_words("   \t \n").is_empty());
    }

    #[test]
    fn split_words_basic() {
        assert_eq!(split_words("hello world"), vec!["hello", "world"]);
    }

    #[test]
    fn split_words_keeps_punctuation_attached() {
        assert_eq!(split_words("Hi, there!"), vec!["Hi,", "there!"]);
    }

    #[test]
    fn split_words_collapses_whitespace() {
        assert_eq!(split_words("a   b\tc\nd"), vec!["a", "b", "c", "d"]);
    }

    // ── lcp_len ────────────────────────────────────────────────────────────

    #[test]
    fn lcp_len_empty() {
        let a: Vec<&str> = vec![];
        let b: Vec<&str> = vec![];
        assert_eq!(lcp_len(&a, &b), 0);
    }

    #[test]
    fn lcp_len_one_empty() {
        assert_eq!(lcp_len(&["a", "b"], &[] as &[&str]), 0);
    }

    #[test]
    fn lcp_len_full_match() {
        assert_eq!(lcp_len(&["a", "b", "c"], &["a", "b", "c"]), 3);
    }

    #[test]
    fn lcp_len_partial() {
        assert_eq!(lcp_len(&["a", "b", "c"], &["a", "b", "x"]), 2);
    }

    #[test]
    fn lcp_len_first_differs() {
        assert_eq!(lcp_len(&["a", "b"], &["x", "b"]), 0);
    }

    #[test]
    fn lcp_len_one_extends_other() {
        assert_eq!(lcp_len(&["a", "b"], &["a", "b", "c"]), 2);
    }

    // ── LocalAgreementCommitter ────────────────────────────────────────────

    #[test]
    fn committer_first_observe_commits_nothing() {
        let mut c = LocalAgreementCommitter::new();
        let d = c.observe(vec!["hello".into(), "world".into()]);
        assert_eq!(d.committed_text, "");
        assert_eq!(d.tentative_text, "hello world");
    }

    #[test]
    fn committer_second_observe_commits_lcp() {
        let mut c = LocalAgreementCommitter::new();
        c.observe(vec!["the".into(), "quick".into(), "brown".into()]);
        let d = c.observe(vec!["the".into(), "quick".into(), "red".into()]);
        assert_eq!(d.committed_text, "the quick");
        assert_eq!(d.tentative_text, "red");
    }

    #[test]
    fn committer_growth_extends_committed_each_decode() {
        let mut c = LocalAgreementCommitter::new();
        c.observe(vec!["a".into(), "b".into()]);
        let d2 = c.observe(vec!["a".into(), "b".into(), "c".into()]);
        assert_eq!(d2.committed_text, "a b");
        assert_eq!(d2.tentative_text, "c");
        let d3 = c.observe(vec!["a".into(), "b".into(), "c".into(), "d".into()]);
        assert_eq!(d3.committed_text, "a b c");
        assert_eq!(d3.tentative_text, "d");
    }

    #[test]
    fn committer_revision_at_first_word_resets_committed() {
        // Whisper revising the first word means LA-2 commits zero this round.
        let mut c = LocalAgreementCommitter::new();
        c.observe(vec!["he".into(), "said".into(), "hi".into()]);
        let d = c.observe(vec!["she".into(), "said".into(), "hi".into()]);
        assert_eq!(d.committed_text, "");
        assert_eq!(d.tentative_text, "she said hi");
    }

    #[test]
    fn committer_reset_drops_state() {
        let mut c = LocalAgreementCommitter::new();
        c.observe(vec!["a".into(), "b".into()]);
        c.reset();
        let d = c.observe(vec!["a".into(), "b".into()]);
        // After reset, this is treated as a new segment so nothing commits.
        assert_eq!(d.committed_text, "");
        assert_eq!(d.tentative_text, "a b");
    }

    #[test]
    fn committer_handles_empty_decode() {
        let mut c = LocalAgreementCommitter::new();
        c.observe(vec!["one".into()]);
        let d = c.observe(vec![]);
        // No common prefix with the empty list.
        assert_eq!(d.committed_text, "");
        assert_eq!(d.tentative_text, "");
    }

    // ── StreamingPipeline ──────────────────────────────────────────────────

    fn cfg_for_tests() -> StreamingConfig {
        StreamingConfig {
            min_window_samples: 16_000,         // 1s
            step_samples: 8_000,                // 0.5s
            max_window_samples: 5 * 16_000,     // 5s hard cap
            silence_flush_samples: 16_000 / 2,  // 0.5s silence
        }
    }

    /// Push helper that just sends `samples` as one frame, marking it speech.
    fn speech(p: &mut StreamingPipeline, n: usize, decode: &mut impl FnMut(&[f32]) -> String) -> Vec<PipelineEvent> {
        let frame = vec![0.1f32; n];
        p.push(&frame, true, decode)
    }
    fn silence(p: &mut StreamingPipeline, n: usize, decode: &mut impl FnMut(&[f32]) -> String) -> Vec<PipelineEvent> {
        let frame = vec![0.0f32; n];
        p.push(&frame, false, decode)
    }

    #[test]
    fn pipeline_no_decode_below_min_window() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let mut decode_calls = 0;
        let mut decode = |_buf: &[f32]| {
            decode_calls += 1;
            "hello".to_string()
        };
        // 0.5s of speech — below 1s min window
        let events = speech(&mut p, 8_000, &mut decode);
        assert!(events.is_empty());
        assert_eq!(decode_calls, 0);
    }

    #[test]
    fn pipeline_emits_interim_at_first_step_after_min_window() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let decoded = std::cell::RefCell::new(vec![]);
        let mut decode = |buf: &[f32]| {
            decoded.borrow_mut().push(buf.len());
            "the quick brown fox".to_string()
        };
        // Push 1.5s of speech in two 0.75s halves so we cross the min_window
        // threshold and then accumulate enough samples_since_decode.
        speech(&mut p, 12_000, &mut decode);
        let events = speech(&mut p, 12_000, &mut decode);
        // After 1.5s buffer, samples_since_decode = 24_000 >= 8_000 step,
        // and buffer >= 16_000 min window → exactly one interim.
        assert_eq!(events.len(), 1);
        match &events[0] {
            PipelineEvent::Interim { committed_text, tentative_text, .. } => {
                assert_eq!(committed_text, ""); // first decode has nothing to agree with
                assert_eq!(tentative_text, "the quick brown fox");
            }
            other => panic!("expected Interim, got {other:?}"),
        }
        assert_eq!(decoded.borrow().len(), 1);
    }

    #[test]
    fn pipeline_promotes_interim_to_committed_on_agreement() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        // Each decode returns a different but prefix-stable transcript so LA-2
        // can grow the committed prefix.
        let decode_outputs = std::cell::RefCell::new(vec![
            "the quick brown".to_string(),
            "the quick brown fox".to_string(),
            "the quick brown fox jumps".to_string(),
        ]);
        let mut decode = |_buf: &[f32]| {
            let mut o = decode_outputs.borrow_mut();
            o.remove(0)
        };
        // Trigger 3 decode ticks: 1.5s, +1s, +1s = 3.5s total.
        speech(&mut p, 24_000, &mut decode);   // 1.5s
        let e2 = speech(&mut p, 16_000, &mut decode); // total 2.5s
        let e3 = speech(&mut p, 16_000, &mut decode); // total 3.5s
        let last2 = match &e2[0] {
            PipelineEvent::Interim { committed_text, tentative_text, .. } => {
                (committed_text.clone(), tentative_text.clone())
            }
            _ => panic!(),
        };
        let last3 = match &e3[0] {
            PipelineEvent::Interim { committed_text, tentative_text, .. } => {
                (committed_text.clone(), tentative_text.clone())
            }
            _ => panic!(),
        };
        assert_eq!(last2.0, "the quick brown");
        assert_eq!(last2.1, "fox");
        assert_eq!(last3.0, "the quick brown fox");
        assert_eq!(last3.1, "jumps");
    }

    #[test]
    fn pipeline_silence_flushes_to_final() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let mut decode_idx = 0;
        let mut decode = |_buf: &[f32]| {
            decode_idx += 1;
            format!("call {decode_idx}").to_string()
        };
        // 2s of speech to fill the buffer past min window, then 0.6s of
        // silence to trigger flush.
        speech(&mut p, 32_000, &mut decode);
        let events = silence(&mut p, (0.6 * 16_000.0) as usize, &mut decode);
        assert!(!events.is_empty());
        let final_ev = events.iter().find(|e| matches!(e, PipelineEvent::Final { .. }));
        assert!(final_ev.is_some(), "expected a Final after silence flush");
        if let Some(PipelineEvent::Final { text, start_ms, end_ms }) = final_ev {
            assert!(!text.is_empty());
            assert_eq!(*start_ms, 0);
            assert!(*end_ms > 0);
        }
    }

    #[test]
    fn pipeline_hard_cap_force_finalizes() {
        let mut cfg = cfg_for_tests();
        cfg.max_window_samples = 2 * 16_000; // 2s hard cap
        let mut p = StreamingPipeline::new(cfg);
        let mut decode = |_buf: &[f32]| "speech here".to_string();
        // 2.5s of continuous speech — should emit Final at the 2s hard cap.
        let events = speech(&mut p, 40_000, &mut decode);
        assert!(events.iter().any(|e| matches!(e, PipelineEvent::Final { .. })));
    }

    #[test]
    fn pipeline_segment_start_advances_after_finalize() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let mut decode = |_buf: &[f32]| "text".to_string();
        speech(&mut p, 32_000, &mut decode); // 2s
        silence(&mut p, (0.6 * 16_000.0) as usize, &mut decode); // flush at 2.6s mark
        // Second segment starts where the first ended.
        speech(&mut p, 32_000, &mut decode);
        let events = silence(&mut p, (0.6 * 16_000.0) as usize, &mut decode);
        let second_final = events.iter().find_map(|e| match e {
            PipelineEvent::Final { start_ms, end_ms, .. } => Some((*start_ms, *end_ms)),
            _ => None,
        });
        let (start, end) = second_final.expect("expected second Final");
        assert!(start >= 2_000, "second segment should start after first (got {start}ms)");
        assert!(end > start);
    }

    #[test]
    fn pipeline_flush_emits_remaining_buffer() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let mut decode = |_buf: &[f32]| "tail words".to_string();
        speech(&mut p, 32_000, &mut decode);
        let events = p.flush(&mut decode);
        assert_eq!(events.len(), 1);
        assert!(matches!(events[0], PipelineEvent::Final { .. }));
    }

    #[test]
    fn pipeline_flush_empty_buffer_is_noop() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let mut decode = |_buf: &[f32]| "x".to_string();
        let events = p.flush(&mut decode);
        assert!(events.is_empty());
    }

    #[test]
    fn pipeline_empty_decode_does_not_emit_final() {
        // Whisper returning an empty string on a buffer should not pollute the
        // transcript with empty Final segments.
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let mut decode = |_buf: &[f32]| String::new();
        speech(&mut p, 32_000, &mut decode);
        let events = silence(&mut p, (0.6 * 16_000.0) as usize, &mut decode);
        assert!(events.iter().all(|e| !matches!(e, PipelineEvent::Final { .. })));
    }

    #[test]
    fn pipeline_pure_silence_never_decodes() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let mut calls = 0;
        let mut decode = |_buf: &[f32]| {
            calls += 1;
            "x".to_string()
        };
        // 3s of pure silence — no Speech frames means buffer fills but
        // silence_run is huge before min_window is reached, so we hit the
        // silence-flush branch which DOES decode once. This is acceptable —
        // it lets us catch any audio we accidentally classified as silent.
        let _ = silence(&mut p, 3 * 16_000, &mut decode);
        assert!(calls <= 1, "pure silence should decode at most once for the flush");
    }

    #[test]
    fn pipeline_zero_length_frame_is_noop() {
        let mut p = StreamingPipeline::new(cfg_for_tests());
        let mut decode = |_buf: &[f32]| "x".to_string();
        let events = p.push(&[], true, &mut decode);
        assert!(events.is_empty());
    }
}
