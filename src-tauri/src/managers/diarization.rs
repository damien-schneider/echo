//! NVIDIA Sortformer via parakeet-rs — offline, max 4 speakers.

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

    pub fn is_available(&self) -> bool {
        self.model_manager
            .get_model_path(DIARIZATION_MODEL_ID)
            .is_ok()
    }

    /// 16 kHz mono f32; `threshold` unused — Sortformer exposes no clustering knob.
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

        // fresh per call — diarize() runs once at meeting end
        let mut sortformer =
            Sortformer::with_config(&model_path, None, DiarizationConfig::callhome()).map_err(
                |e| anyhow::anyhow!("Failed to load Sortformer from {:?}: {}", model_path, e),
            )?;

        // caller already downmixed to mono
        let raw_segments = sortformer
            .diarize(samples.to_vec(), 16_000, 1)
            .map_err(|e| anyhow::anyhow!("Sortformer inference failed: {}", e))?;

        let result: Vec<DiarizationSegment> = raw_segments
            .into_iter()
            .map(|seg| DiarizationSegment {
                // Sortformer emits sample offsets at 16 kHz
                start_ms: (seg.start / 16) as i64,
                end_ms: (seg.end / 16) as i64,
                speaker_id: seg.speaker_id as i32,
            })
            .collect();

        info!("Diarization produced {} segments", result.len());
        Ok(result)
    }

    /// Longer segments give transcription more context.
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

    #[test]
    fn merge_respects_max_duration() {
        let input = [
            seg(0, 10000, 0),
            seg(10000, 20000, 0),
            seg(20000, 30000, 0),
            seg(30000, 40000, 0),
        ];
        let result = DiarizationManager::merge_consecutive(&input, 25_000);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].start_ms, 0);
        assert_eq!(result[0].end_ms, 20000);
        assert_eq!(result[1].start_ms, 20000);
        assert_eq!(result[1].end_ms, 40000);
    }

    #[test]
    fn merge_max_duration_exactly_at_limit() {
        let input = [seg(0, 15000, 0), seg(15000, 30000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].end_ms, 30000);
    }

    #[test]
    fn merge_max_duration_one_over_limit() {
        let input = [seg(0, 15000, 0), seg(15000, 30001, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 2);
    }

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

    #[test]
    fn merge_zero_length_segments() {
        let input = [seg(5000, 5000, 0), seg(5000, 5000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_ms, 5000);
        assert_eq!(result[0].end_ms, 5000);
    }

    #[test]
    fn merge_very_small_max_duration() {
        let input = [seg(0, 5000, 0), seg(5000, 10000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 0);
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
        let input: Vec<DiarizationSegment> =
            (0..10).map(|i| seg(i * 5000, (i + 1) * 5000, 0)).collect();
        let result = DiarizationManager::merge_consecutive(&input, 15_000);
        for s in &result {
            assert!(
                (s.end_ms - s.start_ms) <= 15_000,
                "Segment duration {}ms exceeds 15000ms limit",
                s.end_ms - s.start_ms
            );
        }
        assert_eq!(result.len(), 4);
    }

    #[test]
    fn merge_non_contiguous_same_speaker_still_merges() {
        let input = [seg(0, 3000, 0), seg(5000, 8000, 0)];
        let result = DiarizationManager::merge_consecutive(&input, 30_000);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].start_ms, 0);
        assert_eq!(result[0].end_ms, 8000);
    }
}
