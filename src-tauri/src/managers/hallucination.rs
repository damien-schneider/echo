//! Whisper attractor strings (YouTube auto-captions), and the short replies that look like them.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HallucinationFilter {
    /// Audio that may be silence: a lone "Thank you" there is Whisper filling the void.
    Strict,
    /// A turn the diarizer heard someone speak in: a lone "OK" there is a real reply.
    KeepShortReplies,
}

pub fn is_hallucination(text: &str, filter: HallucinationFilter) -> bool {
    let normalized = normalize_for_hallucination_check(text);
    let has_no_words = !normalized.chars().any(char::is_alphanumeric);
    has_no_words
        || is_attractor_phrase(&normalized)
        || (filter == HallucinationFilter::Strict && is_short_reply(&normalized))
}

fn is_attractor_phrase(normalized: &str) -> bool {
    matches!(
        normalized,
        "thanks for watching"
            | "thank you for watching"
            | "thanks for listening"
            | "thank you for listening"
            | "merci d avoir regardé"
            | "sous titres réalisés par la communauté d amara org"
            | "sous titres réalisés par"
            | "music"
            | "musique"
            | "applause"
            | "laughter"
            | "you"
            | "uh"
            | "um"
            | "ah"
            | "hmm"
    )
}

fn is_short_reply(normalized: &str) -> bool {
    matches!(
        normalized,
        "thank you"
            | "thanks"
            | "thank you very much"
            | "bye"
            | "okay"
            | "ok"
            | "merci"
            | "merci à tous"
    )
}

fn normalize_for_hallucination_check(text: &str) -> String {
    let lowered = text.trim().to_lowercase();
    // Punct→space so "Sous-titres"→"sous titres", "[Music]"→" music ".
    let spaced: String = lowered
        .chars()
        .map(|c| {
            if c.is_ascii_punctuation()
                || matches!(
                    c,
                    '…' | '«' | '»' | '\u{201C}' | '\u{201D}' | '\u{2018}' | '\u{2019}'
                )
            {
                ' '
            } else {
                c
            }
        })
        .collect();
    spaced.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strict(text: &str) -> bool {
        is_hallucination(text, HallucinationFilter::Strict)
    }

    #[test]
    fn hallucination_matches_thank_you_variants() {
        assert!(strict("Thank you."));
        assert!(strict(" thank you "));
        assert!(strict("THANK YOU"));
        assert!(strict("Thanks for watching!"));
        assert!(strict("Thank you for watching."));
    }

    #[test]
    fn hallucination_matches_amara_subtitle_credit() {
        assert!(strict("Sous-titres réalisés par la communauté d'Amara.org"));
        assert!(strict("Sous-titres réalisés par"));
    }

    #[test]
    fn hallucination_matches_fillers_and_wordless_text() {
        for filter in [
            HallucinationFilter::Strict,
            HallucinationFilter::KeepShortReplies,
        ] {
            assert!(is_hallucination("you", filter));
            assert!(is_hallucination(" you. ", filter));
            assert!(is_hallucination("um", filter));
            assert!(is_hallucination("uh", filter));
            assert!(is_hallucination("...", filter));
            assert!(is_hallucination("*Musique*", filter));
            assert!(is_hallucination("", filter));
            assert!(is_hallucination("🎵🎵🎵", filter));
            assert!(is_hallucination("♪ ♪", filter));
        }
    }

    #[test]
    fn short_replies_survive_a_speech_turn() {
        for reply in ["OK", "Merci.", "Thank you."] {
            assert!(!is_hallucination(
                reply,
                HallucinationFilter::KeepShortReplies
            ));
            assert!(strict(reply));
        }
        assert!(is_hallucination(
            "Thanks for watching!",
            HallucinationFilter::KeepShortReplies
        ));
    }

    #[test]
    fn hallucination_does_not_match_real_speech() {
        // Substrings of attractors inside real sentences must NOT match.
        assert!(!strict(
            "Thanks for joining the call everyone, let's get started"
        ));
        assert!(!strict("You said the deadline is Friday"));
        assert!(!strict("I think we should review the design"));
        assert!(!strict("Merci de partager le document"));
    }

    #[test]
    fn hallucination_check_strips_brackets_and_punctuation() {
        assert!(strict("[Music]"));
        assert!(strict("[ Applause ]"));
        assert!(strict("(laughter)"));
    }
}
