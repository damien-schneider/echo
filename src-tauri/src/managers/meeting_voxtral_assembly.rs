//! Voxtral's timed text cut into speaker segments along Sortformer's turns.

use super::diarization::DiarizationSegment;
use super::meeting_voxtral::TimedChunk;

const NEAREST_TURN_MAX_MS: i64 = 1_000;
const SEGMENT_GAP_SPLIT_MS: i64 = 1_500;
const SEGMENT_MAX_MS: i64 = 30_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AssembledSegment {
    pub(super) start_ms: i64,
    pub(super) end_ms: i64,
    pub(super) speaker_id: Option<i32>,
    pub(super) text: String,
}

struct TimedWord<'text> {
    text: &'text str,
    start_ms: i64,
    end_ms: i64,
}

struct ChunkBytes<'chunk> {
    start_byte: usize,
    end_byte: usize,
    chunk: &'chunk TimedChunk,
}

impl ChunkBytes<'_> {
    fn time_at(&self, byte: usize) -> i64 {
        let len = (self.end_byte - self.start_byte).max(1);
        let into = byte.saturating_sub(self.start_byte).min(len);
        let span = self.chunk.end_ms - self.chunk.start_ms;
        self.chunk.start_ms + span * into as i64 / len as i64
    }
}

/// A word Sortformer left without a turn joins the speaker of the words around it.
pub(super) fn assemble_segments(
    chunks: &[TimedChunk],
    turns: &[DiarizationSegment],
) -> Vec<AssembledSegment> {
    let text: String = chunks.iter().map(|chunk| chunk.text.as_str()).collect();
    let mut segments: Vec<AssembledSegment> = Vec::new();
    for word in timed_words(&text, chunks) {
        let speaker_id = speaker_at(&word, turns);
        match segments.last_mut() {
            Some(open) if open.continues_with(&word, speaker_id) => {
                open.text.push(' ');
                open.text.push_str(word.text);
                open.end_ms = word.end_ms;
                open.speaker_id = open.speaker_id.or(speaker_id);
            }
            _ => segments.push(AssembledSegment {
                start_ms: word.start_ms,
                end_ms: word.end_ms,
                speaker_id,
                text: word.text.to_string(),
            }),
        }
    }
    segments
}

impl AssembledSegment {
    fn continues_with(&self, word: &TimedWord, speaker_id: Option<i32>) -> bool {
        let same_speaker =
            self.speaker_id.is_none() || speaker_id.is_none() || self.speaker_id == speaker_id;
        same_speaker
            && word.start_ms - self.end_ms <= SEGMENT_GAP_SPLIT_MS
            && word.end_ms - self.start_ms <= SEGMENT_MAX_MS
    }
}

/// A word split across two chunks takes one span: from its first byte's time to its last's.
fn timed_words<'text>(text: &'text str, chunks: &[TimedChunk]) -> Vec<TimedWord<'text>> {
    let mut offset = 0;
    let spans: Vec<ChunkBytes> = chunks
        .iter()
        .map(|chunk| {
            let start_byte = offset;
            offset += chunk.text.len();
            ChunkBytes {
                start_byte,
                end_byte: offset,
                chunk,
            }
        })
        .collect();
    text.split_whitespace()
        .filter_map(|word| {
            let start_byte = word.as_ptr() as usize - text.as_ptr() as usize;
            let end_byte = start_byte + word.len();
            let first = spans.iter().find(|span| start_byte < span.end_byte)?;
            let last = spans.iter().find(|span| end_byte <= span.end_byte)?;
            Some(TimedWord {
                text: word,
                start_ms: first.time_at(start_byte),
                end_ms: last.time_at(end_byte),
            })
        })
        .collect()
}

/// The containing turn whose centre is nearest, else the nearest turn within a second.
fn speaker_at(word: &TimedWord, turns: &[DiarizationSegment]) -> Option<i32> {
    let mid_ms = (word.start_ms + word.end_ms) / 2;
    let containing = turns
        .iter()
        .filter(|turn| turn.start_ms <= mid_ms && mid_ms <= turn.end_ms)
        .min_by_key(|turn| ((turn.start_ms + turn.end_ms) / 2 - mid_ms).abs());
    containing
        .or_else(|| {
            turns
                .iter()
                .map(|turn| (turn, distance_ms(turn, mid_ms)))
                .filter(|(_, distance)| *distance <= NEAREST_TURN_MAX_MS)
                .min_by_key(|(_, distance)| *distance)
                .map(|(turn, _)| turn)
        })
        .map(|turn| turn.speaker_id)
}

fn distance_ms(turn: &DiarizationSegment, ms: i64) -> i64 {
    if ms < turn.start_ms {
        turn.start_ms - ms
    } else {
        ms - turn.end_ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(start_ms: i64, end_ms: i64, text: &str) -> TimedChunk {
        TimedChunk {
            start_ms,
            end_ms,
            text: text.to_string(),
        }
    }

    fn turn(start_ms: i64, end_ms: i64, speaker_id: i32) -> DiarizationSegment {
        DiarizationSegment {
            start_ms,
            end_ms,
            speaker_id,
        }
    }

    fn texts(segments: &[AssembledSegment]) -> Vec<(&str, Option<i32>)> {
        segments
            .iter()
            .map(|segment| (segment.text.as_str(), segment.speaker_id))
            .collect()
    }

    #[test]
    fn a_speaker_change_starts_a_new_segment() {
        let chunks = [
            chunk(0, 1_000, "Bonjour à"),
            chunk(1_000, 2_000, " tous. Salut"),
        ];
        let turns = [turn(0, 1_400, 0), turn(1_400, 2_000, 1)];

        let segments = assemble_segments(&chunks, &turns);

        assert_eq!(
            texts(&segments),
            [("Bonjour à tous.", Some(0)), ("Salut", Some(1))]
        );
    }

    #[test]
    fn a_long_pause_splits_one_speaker() {
        let chunks = [chunk(0, 500, "Oui."), chunk(3_000, 3_500, " Alors")];
        let turns = [turn(0, 4_000, 0)];

        let segments = assemble_segments(&chunks, &turns);

        assert_eq!(texts(&segments), [("Oui.", Some(0)), ("Alors", Some(0))]);
        assert_eq!(segments[1].start_ms, 3_083);
    }

    #[test]
    fn a_segment_never_spans_more_than_thirty_seconds() {
        let chunks: Vec<TimedChunk> = (0..40)
            .map(|second| chunk(second * 1_000, second * 1_000 + 480, " mot"))
            .collect();
        let turns = [turn(0, 41_000, 0)];

        let segments = assemble_segments(&chunks, &turns);

        assert_eq!(segments.len(), 2);
        assert!(segments
            .iter()
            .all(|segment| segment.end_ms - segment.start_ms <= SEGMENT_MAX_MS));
    }

    #[test]
    fn a_word_split_across_chunks_stays_one_word() {
        let chunks = [chunk(0, 480, " l'util"), chunk(480, 960, "isateur final")];

        let segments = assemble_segments(&chunks, &[turn(0, 1_000, 0)]);

        assert_eq!(texts(&segments), [("l'utilisateur final", Some(0))]);
        assert_eq!((segments[0].start_ms, segments[0].end_ms), (68, 960));
    }

    #[test]
    fn a_word_far_from_every_turn_has_no_speaker() {
        let chunks = [chunk(1_500, 1_800, "près"), chunk(9_000, 9_300, " loin")];

        let segments = assemble_segments(&chunks, &[turn(0, 1_000, 0)]);

        assert_eq!(texts(&segments), [("près", Some(0)), ("loin", None)]);
    }

    #[test]
    fn words_between_turns_join_the_speaker_around_them() {
        let chunks = [
            chunk(0, 1_000, "Faire encore mieux"),
            chunk(1_000, 2_200, " ou encore pire"),
            chunk(4_000, 5_000, " Est-ce que"),
            chunk(5_500, 6_600, " je dois"),
        ];
        let turns = [turn(0, 1_000, 0), turn(6_500, 7_500, 1)];

        let segments = assemble_segments(&chunks, &turns);

        assert_eq!(
            texts(&segments),
            [
                ("Faire encore mieux ou encore pire", Some(0)),
                ("Est-ce que je dois", Some(1))
            ]
        );
    }
}
