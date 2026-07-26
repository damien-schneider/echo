mod line_structure;

use anyhow::{bail, Result};
use line_structure::restore_line_structure;
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashMap;

pub(super) const MAX_POLISH_CHARACTERS: usize = 4_000;

pub(super) fn build_polish_prompt(text: &str) -> String {
    format!(
        "Proofread the text between <text> tags. Fix only spelling, grammar, punctuation, agreement, and clearly awkward idioms; preserve meaning, tone, formatting, and the same language. Preserve URLs, emails, names, identifiers, and code exactly. Return only the corrected text without quotes or explanation.\n<text>{text}</text>"
    )
}

#[cfg(test)]
pub(super) fn validate_polish_output(input: &str, output: &str) -> Result<()> {
    validated_polish_output(input, output).map(drop)
}

pub(super) fn validated_polish_output(input: &str, output: &str) -> Result<String> {
    validate_polish_input(input)?;
    let output = output.trim();
    if output.is_empty() || has_explanation_wrapper(output) {
        bail!("Polish response is empty or contains an explanation");
    }
    validate_language(input, output)?;
    validate_protected_spans(input, output)?;
    validate_edit_size(input, output)?;
    let output = restore_line_structure(input, output)?;
    validate_line_structure(input, &output)?;
    Ok(output)
}

pub(super) fn validate_polish_input(input: &str) -> Result<()> {
    let characters = input.chars().count();
    if input.trim().is_empty() {
        bail!("Select text to polish");
    }
    if characters > MAX_POLISH_CHARACTERS {
        bail!("Selection exceeds {MAX_POLISH_CHARACTERS} characters");
    }
    Ok(())
}

fn has_explanation_wrapper(output: &str) -> bool {
    let lower = output.to_lowercase();
    [
        "corrected text:",
        "polished text:",
        "here is",
        "here's",
        "```",
    ]
    .iter()
    .any(|prefix| lower.starts_with(prefix))
}

fn validate_line_structure(input: &str, output: &str) -> Result<()> {
    let input_lines = input.lines().collect::<Vec<_>>();
    let output_lines = output.lines().collect::<Vec<_>>();
    if input_lines.len() != output_lines.len() {
        bail!("Polish response changed line structure");
    }
    if input_lines
        .iter()
        .zip(output_lines)
        .any(|(before, after)| before.trim().is_empty() != after.trim().is_empty())
    {
        bail!("Polish response changed blank lines");
    }
    Ok(())
}

fn validate_language(input: &str, output: &str) -> Result<()> {
    if dominant_script(input).is_some() && dominant_script(input) != dominant_script(output) {
        bail!("Polish response changed writing system");
    }
    let alphabetic_count = input
        .chars()
        .filter(|character| character.is_alphabetic())
        .count();
    if alphabetic_count >= 40
        && whichlang::detect_language(input) != whichlang::detect_language(output)
    {
        bail!("Polish response changed language");
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum WritingSystem {
    Latin,
    Cyrillic,
    Arabic,
    Devanagari,
    Han,
    Japanese,
    Hangul,
}

fn dominant_script(text: &str) -> Option<WritingSystem> {
    let mut counts = HashMap::new();
    for character in text.chars() {
        if let Some(script) = writing_system(character) {
            *counts.entry(script).or_insert(0) += 1;
        }
    }
    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(script, _)| script)
}

fn writing_system(character: char) -> Option<WritingSystem> {
    match character as u32 {
        0x0041..=0x024f => Some(WritingSystem::Latin),
        0x0400..=0x052f => Some(WritingSystem::Cyrillic),
        0x0600..=0x06ff => Some(WritingSystem::Arabic),
        0x0900..=0x097f => Some(WritingSystem::Devanagari),
        0x3040..=0x30ff => Some(WritingSystem::Japanese),
        0x4e00..=0x9fff => Some(WritingSystem::Han),
        0xac00..=0xd7af => Some(WritingSystem::Hangul),
        _ => None,
    }
}

static PROTECTED_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"https?://[^\s]+",
        r"[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}",
        r"`[^`]+`",
        r"\b[\p{L}\p{N}]+_[\p{L}\p{N}_]+\b",
        r"\b(?:\p{Lu}\p{Ll}+){2,}\b",
        r"\b\p{Ll}[\p{L}\p{N}]*(?:\p{Lu}[\p{L}\p{N}]*)+\b",
        r"\b\p{Lu}\p{Ll}{2,}\b",
        r"\b[\p{L}_][\p{L}\p{N}_]*\([^()\n]*\)",
        r"(?:^|\s)--?[\p{L}\p{N}][\p{L}\p{N}-]*",
        r"\b[\p{L}\p{N}_.-]+/[\p{L}\p{N}_./-]+\b",
    ]
    .iter()
    .map(|pattern| Regex::new(pattern).expect("static protected-span regex must compile"))
    .collect()
});

fn validate_protected_spans(input: &str, output: &str) -> Result<()> {
    let mut expected_counts = HashMap::new();
    for pattern in PROTECTED_PATTERNS.iter() {
        for found in pattern.find_iter(input) {
            *expected_counts.entry(found.as_str()).or_insert(0) += 1;
        }
    }
    for (protected, expected_count) in expected_counts {
        if output.matches(protected).count() < expected_count {
            bail!("Polish response changed protected text");
        }
    }
    Ok(())
}

fn validate_edit_size(input: &str, output: &str) -> Result<()> {
    let input_characters = input.chars().count();
    let output_characters = output.chars().count();
    if output_characters * 10 < input_characters * 7
        || output_characters * 10 > input_characters * 14
    {
        bail!("Polish response changed too much text");
    }
    let input_words = input.split_whitespace().collect::<Vec<_>>();
    let output_words = output.split_whitespace().collect::<Vec<_>>();
    let longest = input_words.len().max(output_words.len());
    if longest > 3 && word_edit_distance(&input_words, &output_words) * 10 > longest * 5 {
        bail!("Polish response edit ratio is unsafe");
    }
    Ok(())
}

fn word_edit_distance(before: &[&str], after: &[&str]) -> usize {
    let mut previous = (0..=after.len()).collect::<Vec<_>>();
    for (before_index, before_word) in before.iter().enumerate() {
        let mut current = vec![before_index + 1];
        for (after_index, after_word) in after.iter().enumerate() {
            let substitution =
                previous[after_index] + usize::from(!before_word.eq_ignore_ascii_case(after_word));
            current.push(
                (current[after_index] + 1)
                    .min(previous[after_index + 1] + 1)
                    .min(substitution),
            );
        }
        previous = current;
    }
    previous[after.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_requests_conservative_proofreading_without_rewriting() {
        let prompt = build_polish_prompt("Bonjour tout le monde");

        assert!(prompt.contains("preserve meaning"));
        assert!(prompt.contains("same language"));
        assert!(prompt.contains("Return only"));
        assert!(prompt.contains("Bonjour tout le monde"));
    }

    #[test]
    fn accepts_screenshot_correction() {
        assert!(validate_polish_output(
            "Have you finally succeeded to take another train?",
            "Have you finally succeeded in taking another train?"
        )
        .is_ok());
    }

    #[test]
    fn restores_line_boundaries_after_a_safe_model_reflow() {
        assert_eq!(
            validated_polish_output(
                "This are wrong.\nKeep this second line.",
                "This is wrong. Keep this second line."
            )
            .unwrap(),
            "This is wrong.\nKeep this second line."
        );
    }

    #[test]
    fn restores_blank_line_topology_after_a_safe_model_reflow() {
        assert_eq!(
            validated_polish_output(
                "This are wrong.\n\nKeep this second paragraph.",
                "This is wrong. Keep this second paragraph."
            )
            .unwrap(),
            "This is wrong.\n\nKeep this second paragraph."
        );
    }

    #[test]
    fn preserves_each_original_line_separator() {
        assert_eq!(
            validated_polish_output(
                "This are wrong.\r\nKeep this line.\nKeep the last line.",
                "This is wrong. Keep this line. Keep the last line."
            )
            .unwrap(),
            "This is wrong.\r\nKeep this line.\nKeep the last line."
        );
    }

    #[test]
    fn preserves_original_line_padding() {
        assert_eq!(
            validated_polish_output(
                "  This are wrong.  \n\tKeep this line.",
                "This is wrong.\nKeep this line."
            )
            .unwrap(),
            "  This is wrong.  \n\tKeep this line."
        );
    }

    #[test]
    fn rejects_translation_explanation_and_truncation() {
        assert!(
            validate_polish_output("Bonjour, comment allez vous ?", "Hello, how are you?").is_err()
        );
        assert!(
            validate_polish_output("This are wrong.", "Corrected text: This is wrong.").is_err()
        );
        assert!(validate_polish_output("First line\nSecond line", "First line").is_err());
    }

    #[test]
    fn preserves_protected_spans_exactly() {
        let input = "Email FooBar at hello@example.com about user_id, runTask(), --safe-mode, src/main.rs, and https://echo.app.";
        let changed = "Email Foobar at hi@example.com about userId, runTasks(), --unsafe-mode, src/lib.rs, and https://echo.dev.";

        assert!(validate_polish_output(input, changed).is_err());
    }

    #[test]
    fn rejects_empty_oversized_and_unsafe_edit_ratio() {
        assert!(validate_polish_output("", "fixed").is_err());
        assert!(validate_polish_output(&"a".repeat(MAX_POLISH_CHARACTERS + 1), "a").is_err());
        assert!(validate_polish_output(
            "A short sentence with a typoo.",
            "Entirely unrelated replacement text about astronomy."
        )
        .is_err());
    }
}
