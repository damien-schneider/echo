//! The stop pass for a source Voxtral already transcribed: Sortformer only says who spoke when.

use log::{info, warn};
use transcribe_cpp::Model;

use super::hallucination::HallucinationFilter;
use super::meeting::{BatchPhase, MeetingManager};
use super::meeting_batch::wav_sample_count;
use super::meeting_batch_plan::{BatchFiles, BatchOutcome, BatchPass, ChunkOutcome, PassProgress};
use super::meeting_types::samples_to_ms;
use super::meeting_voxtral::{transcribe_file, SourceTranscript, TimedChunk};
use super::meeting_voxtral_assembly::assemble_segments;

const FILE_PROGRESS_STEP_MS: usize = 30_000;

impl MeetingManager {
    pub(super) fn store_voxtral_text(
        &self,
        pass: &BatchPass<'_>,
        chunks: &[TimedChunk],
    ) -> BatchOutcome {
        let turns = self.speaker_turns(pass).unwrap_or_else(|e| {
            warn!("Diarization failed, Voxtral's text keeps a single speaker: {e:#}");
            Vec::new()
        });
        let segments = assemble_segments(chunks, &turns);
        let total = segments.len();
        let mut outcome = BatchOutcome::default();
        for (index, segment) in segments.into_iter().enumerate() {
            let label = match segment.speaker_id {
                Some(id) => format!("{} {}", pass.stream.label_prefix, id + 1),
                None => pass.stream.label_prefix.to_string(),
            };
            let pending = pass.segment_at(segment.start_ms, segment.end_ms, label);
            match self.store_segment_text(
                &segment.text,
                pending,
                HallucinationFilter::KeepShortReplies,
            ) {
                ChunkOutcome::Inserted => outcome.inserted += 1,
                ChunkOutcome::Skipped => {}
                ChunkOutcome::Failed => outcome.errors += 1,
            }
            pass.emit_progress(
                &self.app_handle,
                PassProgress {
                    phase: BatchPhase::Transcribing,
                    done: index + 1,
                    total,
                },
            );
        }
        pass.emit_progress(
            &self.app_handle,
            PassProgress {
                phase: BatchPhase::Done,
                done: total,
                total,
            },
        );
        info!(
            "Voxtral text of the {} stream assembled into {total} segments",
            pass.stream.source.as_str()
        );
        outcome
    }

    /// Sources run one after another: a model serves a single stream at a time.
    pub(super) fn voxtral_file_transcripts(
        &self,
        meeting_id: i64,
        files: &BatchFiles,
    ) -> Vec<SourceTranscript> {
        let Some(model_path) = self.voxtral_model_path() else {
            return Vec::new();
        };
        let model = match Model::load(&model_path) {
            Ok(model) => model,
            Err(e) => {
                warn!("Failed to load Voxtral, Whisper retranscribes meeting {meeting_id}: {e:#}");
                return Vec::new();
            }
        };
        files
            .streams()
            .iter()
            .filter_map(|stream| {
                let audio = self.meetings_dir.join(&stream.file_name);
                let total_samples = wav_sample_count(&audio).ok()?;
                let pass = BatchPass {
                    meeting_id,
                    audio,
                    total_samples,
                    stream,
                };
                let total_ms = usize::try_from(samples_to_ms(total_samples)).unwrap_or(0);
                let steps_total = total_ms.div_ceil(FILE_PROGRESS_STEP_MS);
                let mut steps_done = 0;
                let mut on_fed_ms = |fed_ms: i64| {
                    let fed_steps = usize::try_from(fed_ms).unwrap_or(0) / FILE_PROGRESS_STEP_MS;
                    if fed_steps > steps_done {
                        steps_done = fed_steps.min(steps_total);
                        pass.emit_progress(
                            &self.app_handle,
                            PassProgress {
                                phase: BatchPhase::Transcribing,
                                done: steps_done,
                                total: steps_total,
                            },
                        );
                    }
                };
                Some(transcribe_file(
                    &model,
                    &pass.audio,
                    stream.source.clone(),
                    &mut on_fed_ms,
                ))
            })
            .collect()
    }
}
