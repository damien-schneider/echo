//! Auto language per speaker: a short turn decoded alone guesses its language, and an "OK" in a
//! French meeting came out English.

use log::{info, warn};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use tauri::Manager;

use super::diarization::DiarizationSegment;
use super::meeting::MeetingManager;
use super::meeting_batch::read_range;
use super::meeting_batch_plan::BatchPass;
use super::meeting_types::ms_to_samples;
use super::transcription::{transcription_timeout, TranscriptionManager};
use crate::settings;

const PROBE_MAX_MS: i64 = 30_000;
const PROBE_MIN_MS: i64 = 4_000;

impl MeetingManager {
    pub(super) fn speaker_languages(
        &self,
        pass: &BatchPass<'_>,
        merged: &[DiarizationSegment],
    ) -> HashMap<i32, String> {
        if settings::get_settings(&self.app_handle).selected_language != "auto" {
            return HashMap::new();
        }
        let transcription_manager = self.app_handle.state::<Arc<TranscriptionManager>>();
        let speech_ms = speech_ms_by_speaker(merged);

        let mut detected = HashMap::new();
        for (&speaker_id, &total_ms) in &speech_ms {
            if total_ms < PROBE_MIN_MS {
                continue;
            }
            let Some(probe) = speaker_probe(pass, merged, speaker_id) else {
                continue;
            };
            let timeout = transcription_timeout(probe.len());
            match transcription_manager.decode_with_timeout(probe, timeout, None) {
                Ok(decoded) => {
                    if let Some(language) = decoded.language {
                        detected.insert(speaker_id, language);
                    }
                }
                Err(e) => warn!("Language probe failed for speaker {speaker_id}: {e}"),
            }
        }

        let languages = with_dominant_fallback(&speech_ms, detected);
        info!(
            "{} stream languages by speaker: {languages:?}",
            pass.stream.source.as_str()
        );
        languages
    }
}

fn speech_ms_by_speaker(merged: &[DiarizationSegment]) -> BTreeMap<i32, i64> {
    let mut totals = BTreeMap::new();
    for segment in merged {
        *totals.entry(segment.speaker_id).or_insert(0) += segment.end_ms - segment.start_ms;
    }
    totals
}

/// The speaker's longest turns first, up to one Whisper window.
fn speaker_probe(
    pass: &BatchPass<'_>,
    merged: &[DiarizationSegment],
    speaker_id: i32,
) -> Option<Vec<f32>> {
    let mut turns: Vec<&DiarizationSegment> = merged
        .iter()
        .filter(|segment| segment.speaker_id == speaker_id)
        .collect();
    turns.sort_by_key(|segment| std::cmp::Reverse(segment.end_ms - segment.start_ms));

    let max_samples = ms_to_samples(PROBE_MAX_MS);
    let mut probe = Vec::with_capacity(max_samples);
    for turn in turns {
        if probe.len() >= max_samples {
            break;
        }
        let start = ms_to_samples(turn.start_ms);
        let end = ms_to_samples(turn.end_ms).min(pass.total_samples);
        if end <= start {
            continue;
        }
        probe.extend(read_range(&pass.audio, start, end).ok()?);
    }
    probe.truncate(max_samples);
    (probe.len() >= ms_to_samples(PROBE_MIN_MS)).then_some(probe)
}

/// A speaker too short to probe speaks what the meeting speaks most.
fn with_dominant_fallback(
    speech_ms: &BTreeMap<i32, i64>,
    mut detected: HashMap<i32, String>,
) -> HashMap<i32, String> {
    let dominant = speech_ms
        .iter()
        .filter_map(|(speaker_id, total_ms)| Some((*total_ms, detected.get(speaker_id)?)))
        .max_by_key(|(total_ms, _)| *total_ms)
        .map(|(_, language)| language.clone());
    let Some(dominant) = dominant else {
        return detected;
    };
    for speaker_id in speech_ms.keys() {
        detected
            .entry(*speaker_id)
            .or_insert_with(|| dominant.clone());
    }
    detected
}

#[cfg(test)]
mod tests {
    use super::*;

    fn totals(entries: &[(i32, i64)]) -> BTreeMap<i32, i64> {
        entries.iter().copied().collect()
    }

    fn languages(entries: &[(i32, &str)]) -> HashMap<i32, String> {
        entries
            .iter()
            .map(|(speaker_id, language)| (*speaker_id, language.to_string()))
            .collect()
    }

    #[test]
    fn a_short_speaker_takes_the_language_of_the_one_who_spoke_most() {
        let speech = totals(&[(0, 60_000), (1, 20_000), (2, 1_500)]);
        let detected = languages(&[(0, "fr"), (1, "en")]);

        let resolved = with_dominant_fallback(&speech, detected);

        assert_eq!(resolved.get(&2).map(String::as_str), Some("fr"));
        assert_eq!(resolved.get(&1).map(String::as_str), Some("en"));
    }

    #[test]
    fn nobody_probed_leaves_every_speaker_on_auto() {
        let speech = totals(&[(0, 2_000), (1, 3_000)]);

        assert!(with_dominant_fallback(&speech, HashMap::new()).is_empty());
    }

    #[test]
    fn the_fallback_comes_from_a_speaker_whose_probe_answered() {
        let speech = totals(&[(0, 60_000), (1, 20_000), (2, 1_500)]);
        let detected = languages(&[(1, "en")]);

        let resolved = with_dominant_fallback(&speech, detected);

        assert_eq!(resolved.get(&0).map(String::as_str), Some("en"));
        assert_eq!(resolved.get(&2).map(String::as_str), Some("en"));
    }
}
