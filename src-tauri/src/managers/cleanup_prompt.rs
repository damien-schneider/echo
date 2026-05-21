//! Pure-logic helpers for the on-device cleanup model:
//!
//! - `system_prompt(ctx)` — assembles the deterministic system prompt fed
//!   to the LLM (dictionary names, register, language hint, app context).
//! - `diff_guardrail(raw, cleaned)` — last-line safety net that catches
//!   model failures (paraphrasing, hallucinated proper nouns, mass
//!   deletion) and tells the caller to fall back to the raw text.
//!
//! Both functions are intentionally model-agnostic so they can be unit-
//! tested without loading any weights.

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

/// Entry in the user dictionary. `canonical` is the spelling we want
/// preserved verbatim in the cleaned output; `variants` are alternative
/// spellings or phonetic mistranscriptions to map onto it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DictionaryEntry {
    pub canonical: String,
    pub variants: Vec<String>,
}

/// Tone register the model should target. Drives a single line in the
/// system prompt and is otherwise opaque.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Register {
    Casual,
    Formal,
    Code,
    Neutral,
}

impl Register {
    fn label(self) -> &'static str {
        match self {
            Register::Casual => "CASUAL",
            Register::Formal => "FORMAL",
            Register::Code => "CODE",
            Register::Neutral => "NEUTRAL",
        }
    }
}

/// Per-call context passed to the cleanup model. Lives in this module so
/// the prompt builder and the (separate) `CleanupManager` agree on its
/// shape.
#[derive(Debug, Clone)]
pub struct CleanupContext {
    pub dictionary: Vec<DictionaryEntry>,
    pub app_register: Register,
    pub app_name: Option<String>,
    pub language_hint: Option<String>,
}

impl Default for CleanupContext {
    fn default() -> Self {
        Self {
            dictionary: Vec::new(),
            app_register: Register::Neutral,
            app_name: None,
            language_hint: None,
        }
    }
}

/// Verdict from [`diff_guardrail`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuardrailVerdict {
    Accept,
    Reject(String),
}

// ── diff_guardrail thresholds ─────────────────────────────────────────
//
// All four constants were calibrated against real Whisper + Parakeet
// outputs in the spike. Bumping any of these knobs is a behavior change
// and must come with new fixture-based tests.

/// Maximum tolerated growth ratio: cleaned token count can be up to
/// 1.3× raw before we treat the output as paraphrase / insertion.
/// Allows for inserted punctuation tokens and minor capitalisation
/// splits without rejecting legitimate cleanups.
const GUARDRAIL_MAX_GROWTH: f64 = 1.3;

/// Minimum survival ratio when `raw_n >= GUARDRAIL_MIN_LEN_FOR_DELETION_CHECK`.
/// If cleaned drops below `0.5 × raw`, treat as over-deletion.
const GUARDRAIL_MIN_SURVIVAL: f64 = 0.5;

/// Below this raw token count, short fragments may legitimately be
/// dropped to nothing (e.g. "uh" → "") so the survival check is
/// disabled.
const GUARDRAIL_MIN_LEN_FOR_DELETION_CHECK: usize = 5;

/// Maximum tolerated word-level Levenshtein distance per raw token.
/// Above this, we assume the model paraphrased instead of cleaning.
const GUARDRAIL_MAX_EDIT_RATIO: f64 = 0.35;

/// Build the deterministic system prompt for a single cleanup call.
///
/// The prompt enumerates the user dictionary's canonical names, sets the
/// register, optionally mentions the active app, and lists the strict
/// "DO NOT paraphrase / translate / invent" rules.
pub fn system_prompt(ctx: &CleanupContext) -> String {
    let dict_list = if ctx.dictionary.is_empty() {
        "(none)".to_string()
    } else {
        ctx.dictionary
            .iter()
            .map(|e| e.canonical.clone())
            .collect::<Vec<_>>()
            .join(", ")
    };

    let register_extra = match ctx.app_register {
        Register::Code => {
            " Preserve code-like identifiers (camelCase, snake_case) verbatim, \
             no auto-punctuation inside identifiers."
        }
        _ => "",
    };

    let language_line = match &ctx.language_hint {
        Some(lang) if !lang.is_empty() => {
            format!("Language hint: {lang}. Keep the original language; never translate.\n")
        }
        _ => String::new(),
    };

    let app_line = match &ctx.app_name {
        Some(name) if !name.is_empty() => format!("Active application: {name}.\n"),
        _ => String::new(),
    };

    format!(
        "You are a transcription cleanup engine.\n\
         Remove fillers: um, uh, euh, hmm, like, you know, donc voilà, ben.\n\
         Add punctuation and capitalization. End every sentence with a period, question mark, or exclamation mark.\n\
         Format enumerations as bulleted lists if 3+ items.\n\
         Preserve these names exactly (case-sensitive): {dict_list}.\n\
         Register: {register}.{register_extra}\n\
         {language_line}{app_line}\
         FORBIDDEN: paraphrase, translate, invent content, add information, remove content.\n\
         If intent unclear, leave segment UNCHANGED.\n\
         Output ONLY the cleaned text. No prefix. No explanation. No markdown fences.",
        dict_list = dict_list,
        register = ctx.app_register.label(),
        register_extra = register_extra,
        language_line = language_line,
        app_line = app_line,
    )
}

/// Compare raw transcript to model output and decide whether the cleanup
/// is trustworthy enough to ship to the user. Anything suspicious gets
/// rejected with a reason; the caller is expected to fall back to `raw`.
pub fn diff_guardrail(raw: &str, cleaned: &str) -> GuardrailVerdict {
    let raw_tokens = tokenize_words(raw);
    let cleaned_tokens = tokenize_words(cleaned);

    let raw_n = raw_tokens.len();
    let cleaned_n = cleaned_tokens.len();

    // Empty raw → trivially accept (nothing to compare against).
    if raw_n == 0 {
        return GuardrailVerdict::Accept;
    }

    // Reject if cleaned is much longer than raw — likely insertion / paraphrase.
    let raw_n_f = raw_n as f64;
    let cleaned_n_f = cleaned_n as f64;
    if cleaned_n_f > GUARDRAIL_MAX_GROWTH * raw_n_f {
        return GuardrailVerdict::Reject(format!(
            "cleaned token count {cleaned_n} > {GUARDRAIL_MAX_GROWTH} * raw {raw_n} (likely paraphrase / insertion)"
        ));
    }

    // Reject if cleaned is much shorter than raw — likely over-deletion.
    // Allow short fragments (< GUARDRAIL_MIN_LEN_FOR_DELETION_CHECK raw
    // tokens) to be dropped freely.
    if raw_n >= GUARDRAIL_MIN_LEN_FOR_DELETION_CHECK
        && cleaned_n_f < GUARDRAIL_MIN_SURVIVAL * raw_n_f
    {
        return GuardrailVerdict::Reject(format!(
            "cleaned token count {cleaned_n} < {GUARDRAIL_MIN_SURVIVAL} * raw {raw_n} (over-deletion)"
        ));
    }

    // Reject hallucinated proper nouns: any capitalized word in cleaned
    // longer than 3 chars that does NOT appear in raw, unless it is the
    // first token of a sentence (preceded by '.', '!', '?' or at start).
    let raw_lower: std::collections::HashSet<String> =
        raw_tokens.iter().map(|t| t.to_lowercase()).collect();

    let cleaned_with_pos = tokenize_words_with_sentence_start(cleaned);
    for (tok, at_sentence_start) in &cleaned_with_pos {
        if at_sentence_start.to_owned() {
            continue;
        }
        if tok.len() <= 3 {
            continue;
        }
        let first = tok.chars().next().unwrap_or(' ');
        if !first.is_uppercase() {
            continue;
        }
        if !raw_lower.contains(&tok.to_lowercase()) {
            return GuardrailVerdict::Reject(format!(
                "hallucinated proper noun {:?} not present in raw",
                tok
            ));
        }
    }

    // Reject if word-token Levenshtein > GUARDRAIL_MAX_EDIT_RATIO * raw_n.
    let lev = word_levenshtein(&raw_tokens, &cleaned_tokens);
    let lev_budget = GUARDRAIL_MAX_EDIT_RATIO * raw_n_f;
    if (lev as f64) > lev_budget {
        return GuardrailVerdict::Reject(format!(
            "word-Levenshtein {lev} > {GUARDRAIL_MAX_EDIT_RATIO} * raw {raw_n} = {lev_budget:.2} (likely paraphrase)"
        ));
    }

    GuardrailVerdict::Accept
}

/// Apply the user dictionary's variant→canonical substitutions to a raw
/// transcript before it is shown to the LLM (or returned to the user when
/// cleanup is off — although the calling pipeline currently only invokes
/// this when cleanup is enabled).
///
/// Matching rules:
///
/// * Case-insensitive.
/// * Whole-word only — uses Unicode-aware word boundaries so e.g.
///   `Damianic` is NOT replaced when `Damian` is a variant, and
///   French apostrophes (`j'ai vu damien`) work correctly.
/// * The canonical preserves its declared case verbatim.
/// * Empty variants are ignored defensively (they would otherwise match
///   between every character).
///
/// Returns the rewritten text. If the dictionary is empty or no variant
/// matches, the input is returned unchanged.
pub fn apply_dictionary_prepass(text: &str, dictionary: &[DictionaryEntry]) -> String {
    if text.is_empty() || dictionary.is_empty() {
        return text.to_string();
    }

    let mut out = text.to_string();
    for entry in dictionary {
        for variant in &entry.variants {
            if variant.is_empty() {
                continue;
            }
            // `\b` in the `regex` crate is Unicode-aware (matches at a
            // boundary between a word and non-word codepoint), which is
            // what we want for French/multilingual content.
            let pattern = format!(r"\b{}\b", regex::escape(variant));
            let re = match RegexBuilder::new(&pattern)
                .case_insensitive(true)
                .build()
            {
                Ok(r) => r,
                Err(_) => continue,
            };
            out = replace_all_preserve_canonical(&re, &out, &entry.canonical);
        }
    }
    out
}

/// Replace every regex match in `haystack` with `canonical`, copying the
/// in-between text verbatim. Split out for readability.
fn replace_all_preserve_canonical(re: &Regex, haystack: &str, canonical: &str) -> String {
    re.replace_all(haystack, canonical).into_owned()
}

/// Lowercase alphanumeric word tokens. Punctuation is dropped.
fn tokenize_words(s: &str) -> Vec<String> {
    s.split(|c: char| !c.is_alphanumeric() && c != '\'' && c != '-')
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

/// Same as `tokenize_words` but returns each token paired with a flag:
/// true if this token starts a new sentence (begins the string, or is
/// preceded by `.`, `!`, `?` ignoring whitespace).
fn tokenize_words_with_sentence_start(s: &str) -> Vec<(String, bool)> {
    let mut tokens_with_flags: Vec<(String, bool)> = Vec::new();
    let mut current = String::new();
    let mut next_is_sentence_start = true;
    let mut pending_sentence_start = true;

    for c in s.chars() {
        if c.is_alphanumeric() || c == '\'' || c == '-' {
            if current.is_empty() {
                pending_sentence_start = next_is_sentence_start;
                next_is_sentence_start = false;
            }
            current.push(c);
        } else {
            if !current.is_empty() {
                tokens_with_flags.push((current.clone(), pending_sentence_start));
                current.clear();
            }
            if c == '.' || c == '!' || c == '?' {
                next_is_sentence_start = true;
            }
        }
    }
    if !current.is_empty() {
        tokens_with_flags.push((current, pending_sentence_start));
    }
    tokens_with_flags
}

/// Levenshtein distance over arbitrary item sequences (here, word tokens).
fn word_levenshtein(a: &[String], b: &[String]) -> usize {
    let n = a.len();
    let m = b.len();
    if n == 0 {
        return m;
    }
    if m == 0 {
        return n;
    }

    let mut prev: Vec<usize> = (0..=m).collect();
    let mut curr: Vec<usize> = vec![0; m + 1];

    for i in 1..=n {
        curr[0] = i;
        for j in 1..=m {
            let cost = if a[i - 1].eq_ignore_ascii_case(&b[j - 1]) {
                0
            } else {
                1
            };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[m]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_with_dict(names: &[&str]) -> CleanupContext {
        CleanupContext {
            dictionary: names
                .iter()
                .map(|n| DictionaryEntry {
                    canonical: (*n).to_string(),
                    variants: Vec::new(),
                })
                .collect(),
            ..CleanupContext::default()
        }
    }

    #[test]
    fn system_prompt_includes_dictionary() {
        let ctx = ctx_with_dict(&["Damien", "Anthropic", "Tauri"]);
        let p = system_prompt(&ctx);
        assert!(p.contains("Damien"), "missing Damien: {p}");
        assert!(p.contains("Anthropic"), "missing Anthropic: {p}");
        assert!(p.contains("Tauri"), "missing Tauri: {p}");
    }

    #[test]
    fn system_prompt_register_casual_vs_formal() {
        let casual = system_prompt(&CleanupContext {
            app_register: Register::Casual,
            ..CleanupContext::default()
        });
        let formal = system_prompt(&CleanupContext {
            app_register: Register::Formal,
            ..CleanupContext::default()
        });
        assert!(casual.contains("CASUAL"));
        assert!(formal.contains("FORMAL"));
        assert_ne!(casual, formal);
    }

    #[test]
    fn system_prompt_code_register_mentions_identifiers() {
        let p = system_prompt(&CleanupContext {
            app_register: Register::Code,
            ..CleanupContext::default()
        });
        assert!(p.contains("CODE"));
        assert!(
            p.to_lowercase().contains("camelcase") || p.to_lowercase().contains("identifier"),
            "code register should mention identifiers / camelCase: {p}"
        );
    }

    #[test]
    fn guardrail_accepts_filler_removal() {
        let raw = "I uh wanted to like say hello";
        let cleaned = "I wanted to say hello.";
        assert_eq!(diff_guardrail(raw, cleaned), GuardrailVerdict::Accept);
    }

    #[test]
    fn guardrail_rejects_paraphrase() {
        let raw = "I want to go home";
        let cleaned = "I am heading back to my residence";
        match diff_guardrail(raw, cleaned) {
            GuardrailVerdict::Reject(_) => {}
            v => panic!("expected Reject, got {v:?}"),
        }
    }

    #[test]
    fn guardrail_rejects_over_deletion() {
        let raw = "I really wanted to tell you about my day yesterday it was awesome";
        let cleaned = "Hello there.";
        match diff_guardrail(raw, cleaned) {
            GuardrailVerdict::Reject(_) => {}
            v => panic!("expected Reject, got {v:?}"),
        }
    }

    #[test]
    fn guardrail_rejects_new_proper_noun() {
        let raw = "I met someone today";
        let cleaned = "I met Jean-Pierre today.";
        match diff_guardrail(raw, cleaned) {
            GuardrailVerdict::Reject(_) => {}
            v => panic!("expected Reject, got {v:?}"),
        }
    }

    #[test]
    fn guardrail_accepts_punctuation_only() {
        let raw = "hello world";
        let cleaned = "Hello, world.";
        assert_eq!(diff_guardrail(raw, cleaned), GuardrailVerdict::Accept);
    }

    #[test]
    fn guardrail_accepts_short_fragment_minor_change() {
        let raw = "ok yes";
        let cleaned = "OK, yes.";
        assert_eq!(diff_guardrail(raw, cleaned), GuardrailVerdict::Accept);
    }

    #[test]
    fn guardrail_empty_raw_is_accept() {
        assert_eq!(diff_guardrail("", ""), GuardrailVerdict::Accept);
        assert_eq!(diff_guardrail("", "Hello."), GuardrailVerdict::Accept);
    }

    #[test]
    fn dictionary_entry_roundtrips_json() {
        let e = DictionaryEntry {
            canonical: "Anthropic".to_string(),
            variants: vec!["anthropics".to_string(), "anth".to_string()],
        };
        let j = serde_json::to_string(&e).unwrap();
        let back: DictionaryEntry = serde_json::from_str(&j).unwrap();
        assert_eq!(e, back);
    }

    // ── apply_dictionary_prepass tests ─────────────────────────────────

    fn dict(entries: &[(&str, &[&str])]) -> Vec<DictionaryEntry> {
        entries
            .iter()
            .map(|(canon, vars)| DictionaryEntry {
                canonical: (*canon).to_string(),
                variants: vars.iter().map(|v| (*v).to_string()).collect(),
            })
            .collect()
    }

    #[test]
    fn replaces_simple_variant() {
        let d = dict(&[("Damien", &["Damian"])]);
        assert_eq!(
            apply_dictionary_prepass("I met Damian today", &d),
            "I met Damien today"
        );
    }

    #[test]
    fn case_insensitive_match() {
        let d = dict(&[("Damien", &["Damian"])]);
        // Canonical preserves its declared case ("Damien"), match is
        // case-insensitive on the variant.
        assert_eq!(
            apply_dictionary_prepass("i met damian", &d),
            "i met Damien"
        );
    }

    #[test]
    fn respects_word_boundaries() {
        let d = dict(&[("Damien", &["Damian"])]);
        // "Damianic" contains "Damian" but is a different word; must not
        // be replaced.
        assert_eq!(
            apply_dictionary_prepass("Damianic style", &d),
            "Damianic style"
        );
    }

    #[test]
    fn multiple_variants_one_canonical() {
        let d = dict(&[("Damien", &["Damian", "Demian"])]);
        assert_eq!(
            apply_dictionary_prepass("Damian and Demian both", &d),
            "Damien and Damien both"
        );
    }

    #[test]
    fn multiple_entries() {
        let d = dict(&[
            ("Damien", &["Damian"]),
            ("Anthropic", &["anthropics"]),
        ]);
        assert_eq!(
            apply_dictionary_prepass("Damian works at anthropics", &d),
            "Damien works at Anthropic"
        );
    }

    #[test]
    fn empty_dictionary_passthrough() {
        let d: Vec<DictionaryEntry> = Vec::new();
        assert_eq!(
            apply_dictionary_prepass("hello world", &d),
            "hello world"
        );
    }

    #[test]
    fn empty_text_passthrough() {
        let d = dict(&[("Damien", &["Damian"])]);
        assert_eq!(apply_dictionary_prepass("", &d), "");
    }

    #[test]
    fn does_not_replace_when_canonical_already_present() {
        let d = dict(&[("Damien", &["Damian"])]);
        // Input already matches the canonical; output unchanged. We
        // explicitly do NOT want to count "Damien" itself as a variant
        // and re-replace it — that would be a no-op anyway, but the
        // text must stay verbatim.
        assert_eq!(apply_dictionary_prepass("Damien", &d), "Damien");
    }

    #[test]
    fn unicode_word_boundary() {
        let d = dict(&[("Damien", &["damien"])]);
        // The variant "damien" sits between "vu " and end of string in
        // a French sentence with an apostrophe. Word-boundary handling
        // must work across UTF-8.
        assert_eq!(
            apply_dictionary_prepass("j'ai vu damien", &d),
            "j'ai vu Damien"
        );
    }

    #[test]
    fn skips_empty_variants() {
        // An empty variant string would match between every character if
        // naively compiled — defensively skip it.
        let d = dict(&[("Damien", &[""])]);
        assert_eq!(
            apply_dictionary_prepass("hello world", &d),
            "hello world"
        );
    }
}
