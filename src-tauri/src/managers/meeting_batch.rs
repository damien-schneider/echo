//! Post-meeting pass: diarize each recorded stream, then transcribe utterance by utterance.

use anyhow::{Context, Result};
use log::{error, info, warn};
use rusqlite::params;
use std::path::Path;
use std::sync::Arc;
use tauri::Manager;

use super::diarization::{DiarizationManager, DiarizationSegment};
use super::hallucination::HallucinationFilter;
use super::meeting::{BatchPhase, MeetingManager, MeetingStatus};
use super::meeting_batch_plan::{
    chunk_plan, clip_overlaps, final_status, BatchFiles, BatchOutcome, BatchPass, ChunkOutcome,
    PassProgress, PendingSegment, MIN_TRANSCRIBABLE_SAMPLES,
};
use super::meeting_mixdown::{mix_file_name, write_mixdown, MixSources};
use super::meeting_types::{ms_to_samples, samples_to_ms, SAMPLE_RATE};
use super::meeting_voxtral::SourceTranscript;
use super::transcription::{transcription_timeout, TranscriptionManager};
use crate::audio_toolkit::audio::{read_wav_range, WavWindows};
use crate::settings;

const DIARIZATION_WINDOW_SAMPLES: usize = 30 * SAMPLE_RATE;
const MERGED_SEGMENT_MAX_MS: i64 = 30_000;

/// Two failures in a row mean a broken model load, where every remaining chunk would fail just as
/// fast.
const MAX_CONSECUTIVE_DECODE_FAILURES: usize = 2;

impl MeetingManager {
    /// Detached from `stop_meeting`; errors land in the returned status, never propagate.
    /// Rows up to `min_segment_id` predate this pass and are left to the caller.
    pub(super) async fn run_batch_transcription(
        &self,
        meeting_id: i64,
        files: BatchFiles,
        voxtral_transcripts: Vec<SourceTranscript>,
        min_segment_id: i64,
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
                    let voxtral_text = voxtral_transcripts.iter().find(|transcript| {
                        transcript.complete && transcript.source == stream.source
                    });
                    let pass_outcome = match voxtral_text {
                        Some(transcript) => self.store_voxtral_text(&pass, &transcript.chunks),
                        None => self.diarize_and_transcribe(&pass).await,
                    };
                    outcome = outcome.merged(pass_outcome);
                }
                Err(e) => {
                    error!("Failed to open meeting {} audio: {e:#}", stream.file_name);
                    outcome.errors += 1;
                }
            }
        }

        if files.mic.is_some() && files.system.is_some() {
            self.drop_echoed_mic_segments(meeting_id, min_segment_id);
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
        let merged = match self.speaker_turns(pass) {
            Ok(turns) if turns.is_empty() => {
                info!(
                    "No speech detected in the {} stream",
                    pass.stream.source.as_str()
                );
                pass.emit_progress(
                    &self.app_handle,
                    PassProgress {
                        phase: BatchPhase::Done,
                        done: 0,
                        total: 0,
                    },
                );
                return BatchOutcome::default();
            }
            Ok(turns) => turns,
            Err(e) => {
                error!("Diarization failed, falling back to chunked transcription: {e:#}");
                return self.transcribe_chunks(pass).await;
            }
        };

        let languages = self.speaker_languages(pass, &merged);
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
                let label = format!("{} {}", pass.stream.label_prefix, segment.speaker_id + 1);
                let pending = pass.segment_at(segment.start_ms, segment.end_ms, label);
                let language = languages.get(&segment.speaker_id).cloned();
                match self.transcribe_into_segment(
                    chunk,
                    pending,
                    language,
                    HallucinationFilter::KeepShortReplies,
                ) {
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
        info!("Diarized {chunks_total} utterances");
        outcome
    }

    /// Sortformer turns merged up to 30 s and without overlap; empty means no speech.
    pub(super) fn speaker_turns(&self, pass: &BatchPass<'_>) -> Result<Vec<DiarizationSegment>> {
        let diarization_manager = self
            .app_handle
            .try_state::<Arc<DiarizationManager>>()
            .context("DiarizationManager not available")?
            .inner()
            .clone();
        pass.emit_progress(
            &self.app_handle,
            PassProgress {
                phase: BatchPhase::Diarizing,
                done: 0,
                total: 0,
            },
        );
        let raw_segments = WavWindows::open(&pass.audio, DIARIZATION_WINDOW_SAMPLES)
            .and_then(|windows| diarization_manager.diarize(windows))?;
        Ok(clip_overlaps(DiarizationManager::merge_consecutive(
            &raw_segments,
            MERGED_SEGMENT_MAX_MS,
        )))
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
            match self.transcribe_into_segment(chunk, pending, None, HallucinationFilter::Strict) {
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

    fn transcribe_into_segment(
        &self,
        chunk: Vec<f32>,
        pending: PendingSegment,
        language: Option<String>,
        filter: HallucinationFilter,
    ) -> ChunkOutcome {
        let transcription_manager = self.app_handle.state::<Arc<TranscriptionManager>>();
        let timeout = transcription_timeout(chunk.len());
        let text = match transcription_manager.decode_with_timeout(chunk, timeout, language) {
            Ok(decoded) => decoded.text,
            Err(e) => {
                error!(
                    "Failed to transcribe meeting audio at {}ms: {e}",
                    pending.start_ms
                );
                return ChunkOutcome::Failed;
            }
        };
        self.store_segment_text(&text, pending, filter)
    }
}

pub(super) fn read_range(audio: &Path, start: usize, end: usize) -> Result<Vec<f32>> {
    read_wav_range(audio, start, end).inspect_err(|e| {
        error!("Failed to read meeting audio at sample {start}: {e:#}");
    })
}

pub(super) fn wav_sample_count(path: &Path) -> Result<usize> {
    Ok(WavWindows::open(path, 1)?.total_samples())
}
