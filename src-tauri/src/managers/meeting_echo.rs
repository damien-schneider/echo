//! Guest speech played on the speakers reaches the microphone too: without this pass every guest
//! line is transcribed twice, once as the user and once as the guest.

use anyhow::Result;
use log::{info, warn};
use rusqlite::params;
use std::collections::HashMap;

use super::meeting::MeetingManager;
use super::meeting_types::{AudioSource, MeetingSegment};

const ECHO_WINDOW_MS: i64 = 2_000;
const ECHO_MATCH_RATIO: f32 = 0.6;

impl MeetingManager {
    /// Only rows above `min_segment_id` belong to this pass: a retranscribe still holds the old ones.
    pub(super) fn drop_echoed_mic_segments(&self, meeting_id: i64, min_segment_id: i64) {
        match self.delete_echoed_mic_segments(meeting_id, min_segment_id) {
            Ok(0) => {}
            Ok(dropped) => {
                info!("Dropped {dropped} mic segments echoing the guest in meeting {meeting_id}")
            }
            Err(e) => warn!("Failed to drop echoed mic segments of meeting {meeting_id}: {e:#}"),
        }
    }

    fn delete_echoed_mic_segments(&self, meeting_id: i64, min_segment_id: i64) -> Result<usize> {
        let mut segments = self.get_meeting_segments(meeting_id)?;
        segments.retain(|segment| segment.id > min_segment_id);
        let echoed = echoed_mic_segment_ids(&segments);
        let conn = self.get_connection()?;
        for id in &echoed {
            conn.execute("DELETE FROM meeting_segments WHERE id = ?1", params![id])?;
        }
        Ok(echoed.len())
    }
}

pub(super) fn echoed_mic_segment_ids(segments: &[MeetingSegment]) -> Vec<i64> {
    let guest_lines: Vec<(&MeetingSegment, Vec<String>)> = segments
        .iter()
        .filter(|segment| segment.audio_source == AudioSource::System.as_str())
        .map(|segment| (segment, normalized_words(&segment.text)))
        .collect();
    segments
        .iter()
        .filter(|segment| segment.audio_source == AudioSource::Mic.as_str())
        .filter(|mic| repeats_the_guest(mic, &guest_lines))
        .map(|mic| mic.id)
        .collect()
}

fn repeats_the_guest(mic: &MeetingSegment, guest_lines: &[(&MeetingSegment, Vec<String>)]) -> bool {
    let mic_words = normalized_words(&mic.text);
    if mic_words.is_empty() {
        return false;
    }
    let window_start_ms = mic.start_ms - ECHO_WINDOW_MS;
    let window_end_ms = mic.end_ms + ECHO_WINDOW_MS;

    let mut guest_words: HashMap<&str, usize> = HashMap::new();
    for (guest, words) in guest_lines {
        if guest.end_ms >= window_start_ms && guest.start_ms <= window_end_ms {
            for word in words {
                *guest_words.entry(word.as_str()).or_default() += 1;
            }
        }
    }

    let matched = mic_words
        .iter()
        .filter(|word| match guest_words.get_mut(word.as_str()) {
            Some(remaining) if *remaining > 0 => {
                *remaining -= 1;
                true
            }
            _ => false,
        })
        .count();
    matched as f32 / mic_words.len() as f32 >= ECHO_MATCH_RATIO
}

fn normalized_words(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split_whitespace()
        .map(|word| {
            word.trim_matches(|c: char| !c.is_alphanumeric())
                .to_string()
        })
        .filter(|word| !word.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(id: i64, source: AudioSource, start_ms: i64, text: &str) -> MeetingSegment {
        MeetingSegment {
            id,
            meeting_id: 1,
            speaker_label: String::new(),
            start_ms,
            end_ms: start_ms + 3_000,
            text: text.to_string(),
            confidence: None,
            audio_source: source.as_str().to_string(),
        }
    }

    #[test]
    fn a_mic_line_repeating_the_guest_is_dropped() {
        let segments = [
            segment(
                1,
                AudioSource::System,
                10_000,
                "On regarde le prompt à TGPT, d'accord ?",
            ),
            segment(
                2,
                AudioSource::Mic,
                10_400,
                "on regarde le prompt à TGPT d'accord",
            ),
        ];

        assert_eq!(echoed_mic_segment_ids(&segments), vec![2]);
    }

    #[test]
    fn a_mic_reply_that_shares_a_few_words_is_kept() {
        let segments = [
            segment(1, AudioSource::System, 10_000, "je pense que c'est bon"),
            segment(2, AudioSource::Mic, 13_000, "oui je pense aussi"),
        ];

        assert!(echoed_mic_segment_ids(&segments).is_empty());
    }

    #[test]
    fn an_echo_outside_the_time_window_is_kept() {
        let segments = [
            segment(1, AudioSource::System, 10_000, "on regarde le prompt"),
            segment(2, AudioSource::Mic, 20_000, "on regarde le prompt"),
        ];

        assert!(echoed_mic_segment_ids(&segments).is_empty());
    }

    #[test]
    fn a_word_the_guest_said_once_matches_only_once() {
        let segments = [
            segment(1, AudioSource::System, 10_000, "oui"),
            segment(2, AudioSource::Mic, 10_000, "oui oui oui"),
        ];

        assert!(echoed_mic_segment_ids(&segments).is_empty());
    }
}
