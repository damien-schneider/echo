use serde::Serialize;
use tauri::AppHandle;

use crate::settings::{self, PolishLevel, Prompt, PromptRef};

#[derive(Serialize, Debug, PartialEq, Eq)]
pub(crate) struct PromptEntry {
    id: PromptRef,
    name: String,
    instruction: String,
    locked: bool,
}

/// One place to tune how far each level may go, in the prompt and in the guards that police it.
pub(super) struct LevelPolicy {
    pub(super) system: &'static str,
    pub(super) instruction: &'static str,
    pub(super) min_output_length_percent: usize,
    pub(super) max_output_length_percent: usize,
    pub(super) max_word_edit_percent: usize,
}

pub(super) fn level_policy(level: PolishLevel) -> LevelPolicy {
    match level {
        PolishLevel::Correct => LevelPolicy {
            system: "You are a conservative multilingual proofreader. Never translate or rewrite. Keep the input language, meaning, tone, line breaks, names, URLs, emails, identifiers, and code. Fix only clear spelling, grammar, punctuation, or agreement errors. If the text is already correct, return it byte-for-byte. Output only the final text.",
            instruction: "Fix only spelling, grammar, punctuation, and agreement errors, and leave every word choice and sentence shape untouched.",
            min_output_length_percent: 70,
            max_output_length_percent: 140,
            max_word_edit_percent: 50,
        },
        PolishLevel::Natural => LevelPolicy {
            system: "You are a native-speaker editor. Never translate, never add or drop information, never merge, split, or reorder sentences. Keep the input language, meaning, tone, line breaks, names, URLs, emails, identifiers, and code. Output only the final text.",
            instruction: "Fix spelling, grammar, punctuation, and agreement, then rewrite whatever a native speaker would not say: word choice, word order inside a sentence, missing articles, literal translations. Keep every sentence where it is.",
            min_output_length_percent: 70,
            max_output_length_percent: 140,
            max_word_edit_percent: 60,
        },
        PolishLevel::Clear => LevelPolicy {
            system: "You are a native-speaker editor. Never translate, never add information, never drop a point the text makes. Keep the input language, meaning, tone, line breaks, names, URLs, emails, identifiers, and code. Output only the final text.",
            instruction: "Fix spelling, grammar, punctuation, and agreement, rewrite whatever a native speaker would not say, and restructure what reads badly: split run-on sentences, cut repetition, lead with the point.",
            min_output_length_percent: 50,
            max_output_length_percent: 160,
            max_word_edit_percent: 85,
        },
    }
}

fn prompt_library(custom: &[Prompt]) -> Vec<PromptEntry> {
    let builtins = PolishLevel::ALL.into_iter().map(|level| PromptEntry {
        id: PromptRef::Builtin(level),
        name: level.name().to_string(),
        instruction: level_policy(level).instruction.to_string(),
        locked: true,
    });
    let customs = custom.iter().map(|prompt| PromptEntry {
        id: PromptRef::Custom(prompt.id.clone()),
        name: prompt.name.clone(),
        instruction: prompt.instruction.clone(),
        locked: false,
    });
    builtins.chain(customs).collect()
}

#[tauri::command]
pub(crate) fn list_prompts(app: AppHandle) -> Vec<PromptEntry> {
    prompt_library(&settings::get_settings(&app).prompts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_library_lists_locked_levels_before_custom_prompts() {
        let translate = Prompt {
            id: "translate".to_string(),
            name: "Translate".to_string(),
            instruction: "Translate it.".to_string(),
        };

        let library = prompt_library(&[translate]);

        let summary: Vec<_> = library
            .iter()
            .map(|entry| (entry.name.as_str(), entry.locked))
            .collect();
        assert_eq!(
            summary,
            [
                ("Correct", true),
                ("Natural", true),
                ("Clear", true),
                ("Translate", false)
            ]
        );
        assert_eq!(library[3].id, PromptRef::Custom("translate".to_string()));
    }
}
