//! Speaker diarization manager.
//!
//! Runs offline speaker diarization on full audio to identify "who spoke when",
//! using NVIDIA Sortformer (single end-to-end transformer model, max 4 speakers)
//! via the parakeet-rs crate.

use anyhow::{Context, Result};
use log::info;
use parakeet_rs::sortformer::{DiarizationConfig, Sortformer};
use std::sync::Arc;
use tauri::AppHandle;

use super::model::ModelManager;

pub const DIARIZATION_MODEL_ID: &str = "diarization-sortformer";
const DIARIZATION_ONNX_FILENAME: &str = "diar_streaming_sortformer_4spk-v2.onnx";

#[derive(Debug, Clone)]
pub struct DiarizationSegment {
    pub start_ms: i64,
    pub end_ms: i64,
    pub speaker_id: i32,
}

pub struct DiarizationManager {
    model_manager: Arc<ModelManager>,
}

impl DiarizationManager {
    pub fn new(_app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        Ok(Self { model_manager })
    }

    /// Check if the diarization model is downloaded and ready.
    pub fn is_available(&self) -> bool {
        self.model_manager
            .get_model_path(DIARIZATION_MODEL_ID)
            .is_ok()
    }

    /// Run speaker diarization on 16kHz mono f32 samples.
    ///
    /// `threshold` is preserved for API compatibility but not used by Sortformer
    /// (Sortformer is end-to-end and does not expose a clustering threshold).
    pub fn diarize(&self, samples: &[f32], _threshold: f32) -> Result<Vec<DiarizationSegment>> {
        let model_dir = self
            .model_manager
            .get_model_path(DIARIZATION_MODEL_ID)
            .context("Diarization model not available")?;
        let model_path = model_dir.join(DIARIZATION_ONNX_FILENAME);
        anyhow::ensure!(
            model_path.exists(),
            "Sortformer .onnx file not found at {:?}",
            model_path
        );

        info!(
            "Running Sortformer diarization on {:.1}s of audio",
            samples.len() as f32 / 16000.0
        );

        // Loaded fresh per call. Acceptable because diarize() runs once at
        // meeting end. If we ever stream live diarization, cache the instance
        // on DiarizationManager.
        let mut sortformer =
            Sortformer::with_config(&model_path, None, DiarizationConfig::callhome()).map_err(
                |e| anyhow::anyhow!("Failed to load Sortformer from {:?}: {}", model_path, e),
            )?;

        // Sortformer expects 16 kHz mono. Channels=1 since DiarizationManager's
        // caller (meeting.rs:450) already downmixes to mono before this point.
        let raw_segments = sortformer
            .diarize(samples.to_vec(), 16_000, 1)
            .map_err(|e| anyhow::anyhow!("Sortformer inference failed: {}", e))?;

        let result: Vec<DiarizationSegment> = raw_segments
            .into_iter()
            .map(|seg| DiarizationSegment {
                // Sortformer returns sample offsets at 16 kHz; ms = samples / 16.
                start_ms: (seg.start / 16) as i64,
                end_ms: (seg.end / 16) as i64,
                speaker_id: seg.speaker_id as i32,
            })
            .collect();

        info!("Diarization produced {} segments", result.len());
        Ok(result)
    }

    /// Merge consecutive same-speaker segments up to a maximum duration.
    /// This produces longer segments for better transcription context.
    pub fn merge_consecutive(
        segments: &[DiarizationSegment],
        max_duration_ms: i64,
    ) -> Vec<DiarizationSegment> {
        if segments.is_empty() {
            return Vec::new();
        }

        let mut merged: Vec<DiarizationSegment> = Vec::new();
        let mut current = segments[0].clone();

        for seg in &segments[1..] {
            let would_exceed = (seg.end_ms - current.start_ms) > max_duration_ms;
            if seg.speaker_id == current.speaker_id && !would_exceed {
                current.end_ms = seg.end_ms;
            } else {
                merged.push(current);
                current = seg.clone();
            }
        }
        merged.push(current);

        merged
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(start_ms: i64, end_ms: i64, speaker_id: i32) -> DiarizationSegment {
        DiarizationSegment {
            start_ms,
            end_ms,
            speaker_id,
        }
    }

    // ── merge_consecutive: empty / single ──────────────────────────────

    #[test]
    fn merge_empty_returns_empty() {
        let result = DiarizationManager::merge_consecutive(&[], 30_000);
        assert!(result.is_empty());
    }

    #[test]
    fn merge_single_segment_returns_it() {
        let input = [seg(0, 5000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_ms, 0);
        assert_eq!(result[0].end_ms, 5000);
        assert_eq!(result[0].speaker_id, 0);
    }

    // ── merge_consecutive: same speaker merging ────────────────────────

    #[test]
    fn merge_consecutive_same_speaker() {
        let input = [seg(0, 5000, 0), seg(5000, 10000, 0), seg(10000, 15000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_ms, 0);
        assert_eq!(result[0].end_ms, 15000);
    }

    #[test]
    fn merge_different_speakers_not_merged() {
        let input = [seg(0, 5000, 0), seg(5000, 10000, 1), seg(10000, 15000, 2)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].speaker_id, 0);
        assert_eq!(result[1].speaker_id, 1);
        assert_eq!(result[2].speaker_id, 2);
    }

    #[test]
    fn merge_alternating_speakers() {
        let input = [
            seg(0, 3000, 0),
            seg(3000, 6000, 1),
            seg(6000, 9000, 0),
            seg(9000, 12000, 1),
        ];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 4);
    }

    // ── merge_consecutive: max duration enforcement ────────────────────

    #[test]
    fn merge_respects_max_duration() {
        let input = [
            seg(0, 10000, 0),
            seg(10000, 20000, 0),
            seg(20000, 30000, 0),
            seg(30000, 40000, 0),
        ];
        // Max 25s — first two merge (0–20000 = 20s < 25s),
        // adding third would be 0–30000 = 30s > 25s, so split
        let result = DiarizationManager::merge_consecutive(&input, 25_000);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].start_ms, 0);
        assert_eq!(result[0].end_ms, 20000);
        assert_eq!(result[1].start_ms, 20000);
        assert_eq!(result[1].end_ms, 40000);
    }

    #[test]
    fn merge_max_duration_exactly_at_limit() {
        // Two segments whose combined span equals exactly max_duration
        let input = [seg(0, 15000, 0), seg(15000, 30000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        // 30000 - 0 == 30000, not > 30000, so they merge
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].end_ms, 30000);
    }

    #[test]
    fn merge_max_duration_one_over_limit() {
        let input = [seg(0, 15000, 0), seg(15000, 30001, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        // 30001 - 0 > 30000, so they stay separate
        assert_eq!(result.len(), 2);
    }

    // ── merge_consecutive: mixed merging ───────────────────────────────

    #[test]
    fn merge_mixed_speakers_with_merging() {
        let input = [
            seg(0, 5000, 0),
            seg(5000, 10000, 0),
            seg(10000, 15000, 1),
            seg(15000, 20000, 1),
            seg(20000, 25000, 0),
        ];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].start_ms, 0);
        assert_eq!(result[0].end_ms, 10000);
        assert_eq!(result[0].speaker_id, 0);
        assert_eq!(result[1].start_ms, 10000);
        assert_eq!(result[1].end_ms, 20000);
        assert_eq!(result[1].speaker_id, 1);
        assert_eq!(result[2].start_ms, 20000);
        assert_eq!(result[2].end_ms, 25000);
        assert_eq!(result[2].speaker_id, 0);
    }

    // ── Edge cases ─────────────────────────────────────────────────────

    #[test]
    fn merge_zero_length_segments() {
        let input = [seg(5000, 5000, 0), seg(5000, 5000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        // Same speaker, zero duration — should merge
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_ms, 5000);
        assert_eq!(result[0].end_ms, 5000);
    }

    #[test]
    fn merge_very_small_max_duration() {
        // max_duration = 0 means no merging should happen (each segment > 0ms exceeds limit)
        let input = [seg(0, 5000, 0), seg(5000, 10000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 0);
        // would_exceed = (10000 - 0) > 0 → true, so they stay split
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn merge_preserves_speaker_ids() {
        let input = [seg(0, 1000, 42), seg(1000, 2000, 42), seg(2000, 3000, 99)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result[0].speaker_id, 42);
        assert_eq!(result[1].speaker_id, 99);
    }

    #[test]
    fn merge_many_same_speaker_splits_at_max() {
        // 10 segments of 5s each = 50s total, max 15s
        let input: Vec<DiarizationSegment> =
            (0..10).map(|i| seg(i * 5000, (i + 1) * 5000, 0)).collect();
        let result = DiarizationManager::merge_consecutive(&input, 15_000);
        // Each merged segment should be at most 15s
        for s in &result {
            assert!(
                (s.end_ms - s.start_ms) <= 15_000,
                "Segment duration {}ms exceeds 15000ms limit",
                s.end_ms - s.start_ms
            );
        }
        // First: 0-15000 (3 segments), then 15000-30000, 30000-45000, 45000-50000
        assert_eq!(result.len(), 4);
    }

    #[test]
    fn merge_non_contiguous_same_speaker_still_merges() {
        // Gaps between segments should still merge if same speaker under max
        let input = [seg(0, 3000, 0), seg(5000, 8000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_ms, 0);
        assert_eq!(result[0].end_ms, 8000);
    }
}
