//! What one batch pass is made of: the streams it walks, the chunks it cuts, the verdict it returns.

use std::path::PathBuf;
use tauri::Emitter;

use super::meeting::{AudioSource, BatchPhase, MeetingBatchProgress, MeetingStatus};
use super::meeting_types::SAMPLE_RATE;

/// Sortformer numbers speakers per file, so both streams would otherwise answer `Speaker 1`.
pub(super) const MIC_LABEL_PREFIX: &str = "Speaker";
pub(super) const SYSTEM_LABEL_PREFIX: &str = "Guest";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(super) struct BatchOutcome {
    pub inserted: usize,
    pub errors: usize,
}

impl BatchOutcome {
    pub(super) fn merged(self, other: Self) -> Self {
        Self {
            inserted: self.inserted + other.inserted,
            errors: self.errors + other.errors,
        }
    }
}

/// A meeting nobody spoke in is complete, not broken — only a pass that produced nothing while
/// failing has actually lost the recording. Anything in between kept some of it.
pub(super) fn final_status(outcome: BatchOutcome) -> MeetingStatus {
    match (outcome.inserted, outcome.errors) {
        (0, 1..) => MeetingStatus::Error,
        (_, 0) => MeetingStatus::Complete,
        _ => MeetingStatus::Partial,
    }
}

/// The recorded streams of one meeting, with the system stream's capture-start lag.
pub(super) struct BatchFiles {
    pub mic: Option<String>,
    pub system: Option<String>,
    pub system_offset_ms: i64,
}

impl BatchFiles {
    pub(super) fn streams(&self) -> Vec<StreamPass> {
        let mic = self.mic.iter().map(|name| StreamPass {
            file_name: name.clone(),
            label_prefix: MIC_LABEL_PREFIX,
            source: AudioSource::Mic,
            base_offset_ms: 0,
        });
        let system = self.system.iter().map(|name| StreamPass {
            file_name: name.clone(),
            label_prefix: SYSTEM_LABEL_PREFIX,
            source: AudioSource::System,
            base_offset_ms: self.system_offset_ms,
        });
        mic.chain(system).collect()
    }
}

pub(super) struct StreamPass {
    pub(super) file_name: String,
    pub(super) label_prefix: &'static str,
    pub(super) source: AudioSource,
    pub(super) base_offset_ms: i64,
}

pub(super) struct BatchPass<'a> {
    pub(super) meeting_id: i64,
    pub(super) audio: PathBuf,
    pub(super) total_samples: usize,
    pub(super) stream: &'a StreamPass,
}

impl BatchPass<'_> {
    pub(super) fn segment_at(&self, start_ms: i64, end_ms: i64, label: String) -> PendingSegment {
        PendingSegment {
            meeting_id: self.meeting_id,
            speaker_label: label,
            start_ms: start_ms + self.stream.base_offset_ms,
            end_ms: end_ms + self.stream.base_offset_ms,
            source: self.stream.source.clone(),
        }
    }

    pub(super) fn emit_progress(&self, app: &tauri::AppHandle, progress: PassProgress) {
        let _ = app.emit(
            "meeting-batch-progress",
            MeetingBatchProgress {
                meeting_id: self.meeting_id,
                source: self.stream.source.as_str().to_string(),
                phase: progress.phase,
                chunks_done: progress.done,
                chunks_total: progress.total,
            },
        );
    }
}

pub(super) struct PassProgress {
    pub(super) phase: BatchPhase,
    pub(super) done: usize,
    pub(super) total: usize,
}

pub(super) struct PendingSegment {
    pub(super) meeting_id: i64,
    pub(super) speaker_label: String,
    pub(super) start_ms: i64,
    pub(super) end_ms: i64,
    pub(super) source: AudioSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ChunkOutcome {
    Inserted,
    Skipped,
    Failed,
}

/// Fallback walk plan: chunks tile the recording end to end.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChunkPlan {
    pub chunk_size: usize,
    pub chunks_total: usize,
}

/// Chunks used to overlap by 5s, which duplicated every boundary phrase in the transcript. The
/// diarized pass owns utterance boundaries now; this fallback trades a boundary word for that.
pub fn chunk_plan(samples_len: usize, chunk_secs: usize) -> ChunkPlan {
    let chunk_size = chunk_secs.max(1) * SAMPLE_RATE;
    ChunkPlan {
        chunk_size,
        chunks_total: samples_len.div_ceil(chunk_size),
    }
}

#[cfg(test)]
include!("meeting_batch_tests.rs");
