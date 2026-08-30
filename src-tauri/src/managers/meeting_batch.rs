//! Post-meeting pass: diarize each recorded stream, then transcribe utterance by utterance.

use anyhow::Result;
use log::{debug, error, info, warn};
use rusqlite::params;
use std::path::Path;
use std::sync::Arc;
use tauri::{Emitter, Manager};

use super::diarization::DiarizationManager;
use super::meeting::{BatchPhase, MeetingManager, MeetingSegment, MeetingStatus};
use super::meeting_batch_plan::{
    chunk_plan, final_status, BatchFiles, BatchOutcome, BatchPass, ChunkOutcome, PassProgress,
    PendingSegment,
};
use super::meeting_mixdown::{mix_file_name, write_mixdown, MixSources};
use super::meeting_streaming::is_whisper_hallucination;
use super::meeting_types::{ms_to_samples, samples_to_ms, SAMPLE_RATE};
use super::transcription::{transcription_timeout, TranscriptionManager};
use crate::audio_toolkit::audio::{read_wav_range, WavWindows};
use crate::commands::cleanup::{build_context_from_app_settings, CleanupState};
use crate::managers::cleanup_apply::cleanup_or_filter;
use crate::settings;

const DIARIZATION_WINDOW_SAMPLES: usize = 30 * SAMPLE_RATE;
const MERGED_SEGMENT_MAX_MS: i64 = 30_000;
const MIN_TRANSCRIBABLE_SAMPLES: usize = 1600;

/// Whisper decode is non-cancellable: a timed-out chunk keeps running on its own decode state, so
/// queueing the next one stacks live states until the machine runs out of memory. Two failures in a
/// row also mean a broken model load, where every remaining chunk would fail just as fast.
const MAX_CONSECUTIVE_DECODE_FAILURES: usize = 2;

impl MeetingManager {
    /// Detached from `stop_meeting`; errors land in the returned status, never propagate.
    pub(super) async fn run_batch_transcription(
        &self,
        meeting_id: i64,
        files: BatchFiles,
    ) -> MeetingStatus {
        let mut outcome = BatchOutcome::default();

        for stream in files.streams() {
            let audio = self.meetings_dir.join(&stream.file_name);
            match wav_sample_count(&audio) {
                Ok(total_samples) => {
                    let pass = BatchPass {
                        meeting_id,
                        audio,
                        total_samples,
                        stream: &stream,
                    };
                    outcome = outcome.merged(self.diarize_and_transcribe(&pass).await);
                }
                Err(e) => {
                    error!("Failed to open meeting {} audio: {e:#}", stream.file_name);
                    outcome.errors += 1;
                }
            }
        }

        self.write_playback_mixdown(meeting_id, &files);

        let status = final_status(outcome);
        self.set_meeting_status(meeting_id, &status);
        info!(
            "Meeting {meeting_id} batch pass finished: {} segments, {} failures",
            outcome.inserted, outcome.errors
        );
        status
    }

    pub(super) fn keep_audio_awaiting_models(
        &self,
        meeting_id: i64,
        files: &BatchFiles,
    ) -> MeetingStatus {
        self.write_playback_mixdown(meeting_id, files);
        let status = MeetingStatus::Recorded;
        self.set_meeting_status(meeting_id, &status);
        status
    }

    /// Playback needs a single timeline: seeking to a guest's line must not land in the mic track.
    fn write_playback_mixdown(&self, meeting_id: i64, files: &BatchFiles) {
        let (Some(mic), Some(system)) = (files.mic.as_ref(), files.system.as_ref()) else {
            return;
        };
        let out = self.meetings_dir.join(mix_file_name(meeting_id));
        if let Err(e) = write_mixdown(MixSources {
            mic: &self.meetings_dir.join(mic),
            system: &self.meetings_dir.join(system),
            out: &out,
            system_offset_ms: files.system_offset_ms,
        }) {
            warn!("Failed to mix meeting {meeting_id} audio for playback: {e:#}");
            let _ = std::fs::remove_file(&out);
        }
    }

    pub(super) fn set_meeting_status(&self, meeting_id: i64, status: &MeetingStatus) {
        let updated = self.get_connection().and_then(|conn| {
            conn.execute(
                "UPDATE meetings SET status = ?1 WHERE id = ?2",
                params![status.as_str(), meeting_id],
            )
            .map_err(Into::into)
        });
        if let Err(e) = updated {
            error!("Failed to set meeting {meeting_id} status: {e:#}");
        }
    }

    /// Falls back to fixed-size chunks when diarization cannot run.
    async fn diarize_and_transcribe(&self, pass: &BatchPass<'_>) -> BatchOutcome {
        let Some(diarization_manager) = self.app_handle.try_state::<Arc<DiarizationManager>>()
        else {
            warn!("DiarizationManager not available, falling back to chunked transcription");
            return self.transcribe_chunks(pass).await;
        };
        let diarization_manager = diarization_manager.inner().clone();

        pass.emit_progress(
            &self.app_handle,
            PassProgress {
                phase: BatchPhase::Diarizing,
                done: 0,
                total: 0,
            },
        );

        let diarized = WavWindows::open(&pass.audio, DIARIZATION_WINDOW_SAMPLES)
            .and_then(|windows| diarization_manager.diarize(windows));

        let raw_segments = match diarized {
            Ok(segments) if !segments.is_empty() => segments,
            Ok(_) => {
                warn!("Diarization returned no segments, falling back to chunked transcription");
                return self.transcribe_chunks(pass).await;
            }
            Err(e) => {
                error!("Diarization failed, falling back to chunked transcription: {e:#}");
                return self.transcribe_chunks(pass).await;
            }
        };

        let merged = DiarizationManager::merge_consecutive(&raw_segments, MERGED_SEGMENT_MAX_MS);
        let chunks_total = merged.len();
        self.prepare_transcription(pass, chunks_total);

        let mut outcome = BatchOutcome::default();
        let mut consecutive_failures = 0usize;

        for (index, segment) in merged.iter().enumerate() {
            let start_sample = ms_to_samples(segment.start_ms);
            let end_sample = ms_to_samples(segment.end_ms).min(pass.total_samples);

            if end_sample.saturating_sub(start_sample) >= MIN_TRANSCRIBABLE_SAMPLES {
                let Ok(chunk) = read_range(&pass.audio, start_sample, end_sample) else {
                    outcome.errors += 1;
                    break;
                };
                let label = format!("{} {}", pass.stream.label_prefix, segment.speaker_id);
                let pending = pass.segment_at(segment.start_ms, segment.end_ms, label);
                match self.transcribe_into_segment(chunk, pending) {
                    ChunkOutcome::Inserted => {
                        outcome.inserted += 1;
                        consecutive_failures = 0;
                    }
                    ChunkOutcome::Skipped => consecutive_failures = 0,
                    ChunkOutcome::Failed => {
                        outcome.errors += 1;
                        consecutive_failures += 1;
                    }
                }
            }

            pass.emit_progress(
                &self.app_handle,
                PassProgress {
                    phase: BatchPhase::Transcribing,
                    done: index + 1,
                    total: chunks_total,
                },
            );
            if consecutive_failures >= MAX_CONSECUTIVE_DECODE_FAILURES {
                error!("Abandoning diarized transcription after {consecutive_failures} failures");
                break;
            }
        }

        pass.emit_progress(
            &self.app_handle,
            PassProgress {
                phase: BatchPhase::Done,
                done: chunks_total,
                total: chunks_total,
            },
        );
        info!(
            "Diarized {} utterances from {} raw segments",
            chunks_total,
            raw_segments.len()
        );
        outcome
    }

    /// Reads the recording chunk by chunk: batch passes must not scale with meeting length.
    async fn transcribe_chunks(&self, pass: &BatchPass<'_>) -> BatchOutcome {
        let chunk_secs = settings::get_settings(&self.app_handle)
            .meeting_chunk_duration_secs
            .max(10) as usize;
        let plan = chunk_plan(pass.total_samples, chunk_secs);
        self.prepare_transcription(pass, plan.chunks_total);

        let mut outcome = BatchOutcome::default();
        let mut consecutive_failures = 0usize;
        let mut chunks_done = 0usize;
        let mut position = 0usize;

        while position < pass.total_samples {
            let end = (position + plan.chunk_size).min(pass.total_samples);
            let Ok(chunk) = read_range(&pass.audio, position, end) else {
                outcome.errors += 1;
                break;
            };

            let start_ms = samples_to_ms(position);
            let pending = pass.segment_at(
                start_ms,
                samples_to_ms(end),
                pass.stream.label_prefix.to_string(),
            );
            match self.transcribe_into_segment(chunk, pending) {
                ChunkOutcome::Inserted => {
                    outcome.inserted += 1;
                    consecutive_failures = 0;
                }
                ChunkOutcome::Skipped => consecutive_failures = 0,
                ChunkOutcome::Failed => {
                    outcome.errors += 1;
                    consecutive_failures += 1;
                }
            }

            chunks_done += 1;
            pass.emit_progress(
                &self.app_handle,
                PassProgress {
                    phase: BatchPhase::Transcribing,
                    done: chunks_done,
                    total: plan.chunks_total,
                },
            );
            if consecutive_failures >= MAX_CONSECUTIVE_DECODE_FAILURES {
                error!("Abandoning batch transcription after {consecutive_failures} failures");
                break;
            }
            position = end;
        }

        pass.emit_progress(
            &self.app_handle,
            PassProgress {
                phase: BatchPhase::Done,
                done: chunks_done,
                total: plan.chunks_total,
            },
        );
        outcome
    }

    fn prepare_transcription(&self, pass: &BatchPass<'_>, chunks_total: usize) {
        self.app_handle
            .state::<Arc<TranscriptionManager>>()
            .initiate_model_load();
        pass.emit_progress(
            &self.app_handle,
            PassProgress {
                phase: BatchPhase::Transcribing,
                done: 0,
                total: chunks_total,
            },
        );
    }

    fn transcribe_into_segment(&self, chunk: Vec<f32>, pending: PendingSegment) -> ChunkOutcome {
        let transcription_manager = self.app_handle.state::<Arc<TranscriptionManager>>();
        let timeout = transcription_timeout(chunk.len());
        let text = match transcription_manager.transcribe_with_timeout(chunk, timeout) {
            Ok(text) => text,
            Err(e) => {
                error!(
                    "Failed to transcribe meeting audio at {}ms: {e}",
                    pending.start_ms
                );
                return ChunkOutcome::Failed;
            }
        };

        let cleaned = self.apply_cleanup_filter(text.trim());
        if cleaned.is_empty() {
            debug!(
                "Skipped chunk at {}ms (empty or hallucination): {:?}",
                pending.start_ms,
                text.trim()
            );
            return ChunkOutcome::Skipped;
        }

        let segment = MeetingSegment {
            id: 0,
            meeting_id: pending.meeting_id,
            speaker_label: pending.speaker_label,
            start_ms: pending.start_ms,
            end_ms: pending.end_ms,
            text: cleaned,
            confidence: None,
            audio_source: pending.source.as_str().to_string(),
        };
        match self.insert_segment(&segment) {
            Ok(()) => {
                let _ = self.app_handle.emit("meeting-segment-added", &segment);
                ChunkOutcome::Inserted
            }
            Err(e) => {
                error!("Failed to insert meeting segment: {e:#}");
                ChunkOutcome::Failed
            }
        }
    }

    fn insert_segment(&self, segment: &MeetingSegment) -> Result<()> {
        let conn = self.get_connection()?;
        conn.execute(
            "INSERT INTO meeting_segments (meeting_id, speaker_label, start_ms, end_ms, text, confidence, audio_source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                segment.meeting_id,
                segment.speaker_label,
                segment.start_ms,
                segment.end_ms,
                segment.text,
                segment.confidence,
                segment.audio_source,
            ],
        )?;
        Ok(())
    }

    fn apply_cleanup_filter(&self, text: &str) -> String {
        let settings = settings::get_settings(&self.app_handle);
        let Some(cleanup_state) = self.app_handle.try_state::<CleanupState>() else {
            // Test harness: hallucination filter only.
            if is_whisper_hallucination(text) {
                return String::new();
            }
            return text.to_string();
        };
        let cleanup_state = cleanup_state.inner().clone();
        cleanup_or_filter(text, &cleanup_state, &settings, || {
            build_context_from_app_settings(&settings)
        })
    }
}

fn read_range(audio: &Path, start: usize, end: usize) -> Result<Vec<f32>> {
    read_wav_range(audio, start, end).inspect_err(|e| {
        error!("Failed to read meeting audio at sample {start}: {e:#}");
    })
}

pub(super) fn wav_sample_count(path: &Path) -> Result<usize> {
    Ok(WavWindows::open(path, 1)?.total_samples())
}
