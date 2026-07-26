#[cfg(test)]
mod tests {
    use super::*;

    fn interim(committed: &str, tentative: &str) -> PipelineEvent {
        PipelineEvent::Interim {
            committed_text: committed.to_string(),
            tentative_text: tentative.to_string(),
            segment_start_ms: 0,
        }
    }

    fn final_segment(text: &str) -> PipelineEvent {
        PipelineEvent::Final {
            text: text.to_string(),
            start_ms: 0,
            end_ms: 1_000,
        }
    }

    #[test]
    fn empty_interim_emits_nothing() {
        let mut acc = DictationAccumulator::new();
        assert_eq!(acc.push(interim("", "")), None);
    }

    #[test]
    fn first_interim_with_tentative_emits_tentative() {
        let mut acc = DictationAccumulator::new();
        assert_eq!(
            acc.push(interim("", "hello")),
            Some("hello".to_string())
        );
    }

    #[test]
    fn interim_committed_and_tentative_join_with_space() {
        let mut acc = DictationAccumulator::new();
        assert_eq!(
            acc.push(interim("hello", "world")),
            Some("hello world".to_string())
        );
    }

    #[test]
    fn final_appends_to_committed_history() {
        let mut acc = DictationAccumulator::new();
        acc.push(interim("", "first segment"));
        let out = acc.push(final_segment("first segment."));
        assert_eq!(out, Some("first segment.".to_string()));
        assert_eq!(acc.final_segment_count(), 1);
    }

    #[test]
    fn second_segment_appends_after_first_final() {
        let mut acc = DictationAccumulator::new();
        acc.push(final_segment("First."));
        let out = acc.push(interim("Second", "in progress"));
        assert_eq!(out, Some("First. Second in progress".to_string()));
    }

    #[test]
    fn committed_history_never_shrinks_on_empty_interim() {
        // Silence after Final must not collapse display.
        let mut acc = DictationAccumulator::new();
        acc.push(final_segment("the previous text"));
        let out = acc.push(interim("", ""));
        assert_eq!(out, None);
        let out2 = acc.push(interim("", "new words"));
        assert_eq!(out2, Some("the previous text new words".to_string()));
    }

    #[test]
    fn empty_final_text_is_dropped() {
        // Filtered Final text must not pollute history.
        let mut acc = DictationAccumulator::new();
        acc.push(interim("", "real text"));
        let out = acc.push(final_segment(""));
        assert_eq!(out, None);
        assert_eq!(acc.final_segment_count(), 0);
    }

    #[test]
    fn whitespace_only_final_is_dropped() {
        let mut acc = DictationAccumulator::new();
        let out = acc.push(final_segment("   \t\n"));
        assert_eq!(out, None);
        assert_eq!(acc.final_segment_count(), 0);
    }

    #[test]
    fn duplicate_consecutive_emits_are_suppressed() {
        let mut acc = DictationAccumulator::new();
        let a = acc.push(interim("hello", "world"));
        let b = acc.push(interim("hello", "world"));
        assert_eq!(a, Some("hello world".to_string()));
        assert_eq!(b, None);
    }

    #[test]
    fn changed_interim_emits_new_display() {
        let mut acc = DictationAccumulator::new();
        acc.push(interim("hello", "world"));
        let out = acc.push(interim("hello world", "today"));
        assert_eq!(out, Some("hello world today".to_string()));
    }

    #[test]
    fn reset_clears_history_and_last_emit() {
        let mut acc = DictationAccumulator::new();
        acc.push(final_segment("session one"));
        acc.reset();
        assert_eq!(acc.final_segment_count(), 0);
        let out = acc.push(interim("", "session one"));
        assert_eq!(out, Some("session one".to_string()));
    }

    #[test]
    fn long_sequence_never_emits_empty_after_first_speech() {
        // Monotonic: display never shrinks past prior length once committed.
        let mut acc = DictationAccumulator::new();
        let mut max_len = 0;
        for ev in [
            interim("", "hello"),
            interim("hello", "world"),
            final_segment("hello world."),
            interim("", ""),
            interim("", "again"),
            final_segment("again."),
            interim("", ""),
            interim("", "more"),
        ] {
            if let Some(disp) = acc.push(ev) {
                assert!(
                    disp.len() >= max_len,
                    "display shrank from {max_len} to {} ({disp:?})",
                    disp.len()
                );
                max_len = disp.len();
            }
        }
        assert!(acc.final_segment_count() >= 2);
    }
}


