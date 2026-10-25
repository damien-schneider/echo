#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_plan_empty_buffer_yields_no_chunks() {
        assert_eq!(chunk_plan(0, 30).chunks_total, 0);
    }

    #[test]
    fn chunk_plan_buffer_shorter_than_chunk_yields_one() {
        assert_eq!(chunk_plan(10 * SAMPLE_RATE, 30).chunks_total, 1);
    }

    #[test]
    fn chunk_plan_buffer_equal_to_chunk_yields_one() {
        assert_eq!(chunk_plan(30 * SAMPLE_RATE, 30).chunks_total, 1);
    }

    /// 5s overlap used to make this 12 chunks, and every chunk repeated the last 5s of the previous.
    #[test]
    fn chunks_tile_the_recording_without_overlap() {
        let plan = chunk_plan(5 * 60 * SAMPLE_RATE, 30);
        assert_eq!(plan.chunks_total, 10);
        assert_eq!(plan.chunk_size, 30 * SAMPLE_RATE);
    }

    #[test]
    fn chunk_plan_clamps_chunk_secs_to_at_least_one_second() {
        assert!(chunk_plan(0, 0).chunk_size >= SAMPLE_RATE);
    }

    #[test]
    fn chunk_plan_count_matches_the_walk_it_describes() {
        for secs in [1_usize, 7, 15, 30, 65, 137, 300] {
            for chunk_secs in [10_usize, 30, 60] {
                let samples_len = secs * SAMPLE_RATE;
                let plan = chunk_plan(samples_len, chunk_secs);
                let mut position = 0usize;
                let mut count = 0usize;
                while position < samples_len {
                    position = (position + plan.chunk_size).min(samples_len);
                    count += 1;
                }
                assert_eq!(
                    plan.chunks_total, count,
                    "mismatch for secs={secs} chunk_secs={chunk_secs}"
                );
            }
        }
    }

    #[test]
    fn a_silent_meeting_completes_instead_of_erroring() {
        assert_eq!(
            final_status(BatchOutcome {
                inserted: 0,
                errors: 0
            }),
            MeetingStatus::Complete
        );
    }

    #[test]
    fn a_pass_that_only_failed_is_an_error_not_an_empty_transcript() {
        assert_eq!(
            final_status(BatchOutcome {
                inserted: 0,
                errors: 3
            }),
            MeetingStatus::Error
        );
    }

    /// Calling a half-decoded pass `complete` hides the missing minutes: the user reads a
    /// transcript with holes in it and never learns there is something to retry.
    #[test]
    fn a_pass_that_lost_chunks_is_partial_not_complete() {
        assert_eq!(
            final_status(BatchOutcome {
                inserted: 12,
                errors: 1
            }),
            MeetingStatus::Partial
        );
    }

    fn files() -> BatchFiles {
        BatchFiles {
            mic: Some("meeting-1-mic.wav".into()),
            system: Some("meeting-1-system.wav".into()),
            system_offset_ms: 420,
        }
    }

    #[test]
    fn both_streams_are_diarized_under_distinct_speaker_names() {
        let streams = files().streams();

        assert_eq!(streams.len(), 2);
        assert_eq!(streams[0].label_prefix, "Speaker");
        assert_eq!(streams[1].label_prefix, "Guest");
        assert_ne!(streams[0].label_prefix, streams[1].label_prefix);
    }

    #[test]
    fn only_the_system_stream_carries_the_capture_start_lag() {
        let streams = files().streams();

        assert_eq!(streams[0].base_offset_ms, 0);
        assert_eq!(streams[1].base_offset_ms, 420);
    }

    #[test]
    fn a_missing_stream_is_skipped_rather_than_read_as_an_empty_name() {
        let mic_only = BatchFiles {
            mic: Some("meeting-1-mic.wav".into()),
            system: None,
            system_offset_ms: 0,
        };

        let streams = mic_only.streams();
        assert_eq!(streams.len(), 1);
        assert_eq!(streams[0].source, AudioSource::Mic);
    }

    fn turn(start_ms: i64, end_ms: i64, speaker_id: i32) -> DiarizationSegment {
        DiarizationSegment {
            start_ms,
            end_ms,
            speaker_id,
        }
    }

    fn spans(segments: &[DiarizationSegment]) -> Vec<(i64, i64, i32)> {
        segments
            .iter()
            .map(|segment| (segment.start_ms, segment.end_ms, segment.speaker_id))
            .collect()
    }

    #[test]
    fn a_turn_inside_a_longer_turn_is_dropped() {
        let clipped = clip_overlaps(vec![turn(0, 10_000, 0), turn(2_000, 4_000, 1)]);

        assert_eq!(spans(&clipped), vec![(0, 10_000, 0)]);
    }

    #[test]
    fn a_partially_overlapping_turn_starts_where_the_previous_ends() {
        let clipped = clip_overlaps(vec![
            turn(0, 5_000, 0),
            turn(4_000, 9_000, 1),
            turn(8_950, 9_020, 0),
        ]);

        assert_eq!(spans(&clipped), vec![(0, 5_000, 0), (5_000, 9_000, 1)]);
    }

    fn recorded_meeting() -> BatchFiles {
        BatchFiles {
            mic: Some("meeting-1-mic.wav".to_string()),
            system: Some("meeting-1-system.wav".to_string()),
            system_offset_ms: 0,
        }
    }

    fn live_transcript(source: AudioSource, complete: bool) -> SourceTranscript {
        SourceTranscript {
            source,
            chunks: Vec::new(),
            complete,
        }
    }

    fn sources(streams: &[StreamPass]) -> Vec<AudioSource> {
        streams.iter().map(|stream| stream.source.clone()).collect()
    }

    #[test]
    fn stop_sends_only_the_streams_without_complete_live_voxtral_text_to_voxtral() {
        let live = [live_transcript(AudioSource::Mic, true)];

        let missing = recorded_meeting().streams_without_voxtral_text(&live);

        assert_eq!(sources(&missing), vec![AudioSource::System]);
    }

    #[test]
    fn a_live_stream_that_lost_audio_is_transcribed_again() {
        let live = [
            live_transcript(AudioSource::Mic, false),
            live_transcript(AudioSource::System, true),
        ];

        let missing = recorded_meeting().streams_without_voxtral_text(&live);

        assert_eq!(sources(&missing), vec![AudioSource::Mic]);
    }
}
