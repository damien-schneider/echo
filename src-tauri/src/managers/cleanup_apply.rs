use regex::{NoExpand, RegexBuilder};

use crate::managers::hallucination::{is_hallucination, HallucinationFilter};
use crate::settings::{AppSettings, DictionaryEntrySetting};

pub fn clean_transcript(text: &str, filter: HallucinationFilter, settings: &AppSettings) -> String {
    if is_hallucination(text, filter) {
        return String::new();
    }
    if !settings.cleanup_enabled {
        return text.to_string();
    }
    apply_dictionary(text, &settings.cleanup_dictionary)
}

fn apply_dictionary(text: &str, dictionary: &[DictionaryEntrySetting]) -> String {
    let mut out = text.to_string();
    for entry in dictionary {
        for variant in entry.variants.iter().filter(|variant| !variant.is_empty()) {
            let pattern = format!(r"\b{}\b", regex::escape(variant));
            let Ok(re) = RegexBuilder::new(&pattern).case_insensitive(true).build() else {
                continue;
            };
            out = re
                .replace_all(&out, NoExpand(&entry.canonical))
                .into_owned();
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::get_default_settings;
    use HallucinationFilter::Strict;

    fn settings(cleanup_enabled: bool, dictionary: &[(&str, &[&str])]) -> AppSettings {
        let mut s = get_default_settings();
        s.cleanup_enabled = cleanup_enabled;
        s.cleanup_dictionary = dictionary
            .iter()
            .map(|(canonical, variants)| DictionaryEntrySetting {
                canonical: (*canonical).to_string(),
                variants: variants.iter().map(|v| (*v).to_string()).collect(),
            })
            .collect();
        s
    }

    #[test]
    fn real_speech_passes_through_when_cleanup_is_off() {
        let out = clean_transcript(
            "Hello world, this is real speech",
            Strict,
            &settings(false, &[]),
        );
        assert_eq!(out, "Hello world, this is real speech");
    }

    #[test]
    fn hallucinations_are_dropped_whether_cleanup_is_on_or_off() {
        for enabled in [false, true] {
            let s = settings(enabled, &[("Damien", &["Damian"])]);
            assert_eq!(clean_transcript("Thanks for watching!", Strict, &s), "");
            assert_eq!(clean_transcript("Thank you for watching.", Strict, &s), "");
        }
    }

    #[test]
    fn dictionary_is_applied_only_when_cleanup_is_on() {
        let dictionary: &[(&str, &[&str])] = &[("Damien", &["Damian"])];
        assert_eq!(
            clean_transcript("I met Damian today", Strict, &settings(true, dictionary)),
            "I met Damien today"
        );
        assert_eq!(
            clean_transcript("I met Damian today", Strict, &settings(false, dictionary)),
            "I met Damian today"
        );
    }

    #[test]
    fn dictionary_matches_whole_words_in_any_case() {
        let s = settings(true, &[("Damien", &["Damian", "Demian"])]);
        assert_eq!(
            clean_transcript("damian and DEMIAN, not Damianic", Strict, &s),
            "Damien and Damien, not Damianic"
        );
    }

    #[test]
    fn dictionary_applies_every_entry() {
        let s = settings(
            true,
            &[("Damien", &["Damian"]), ("Anthropic", &["anthropics"])],
        );
        assert_eq!(
            clean_transcript("Damian works at anthropics", Strict, &s),
            "Damien works at Anthropic"
        );
    }

    #[test]
    fn dictionary_respects_unicode_word_boundaries() {
        let s = settings(true, &[("Damien", &["damien"])]);
        assert_eq!(
            clean_transcript("j'ai vu damien", Strict, &s),
            "j'ai vu Damien"
        );
    }

    #[test]
    fn an_empty_variant_changes_nothing() {
        let s = settings(true, &[("Damien", &[""])]);
        assert_eq!(clean_transcript("hello world", Strict, &s), "hello world");
    }

    #[test]
    fn a_canonical_spelling_with_a_dollar_sign_is_inserted_as_written() {
        let s = settings(true, &[("$ECHO", &["echo ticker"])]);
        assert_eq!(
            clean_transcript("buy echo ticker now", Strict, &s),
            "buy $ECHO now"
        );
    }
}
