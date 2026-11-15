use super::*;

pub const TRANSLATE_PROMPT_ID: &str = "translate";
const LEGACY_DEFAULT_PROMPT_ID: &str = "default_improve_transcriptions";
const LEGACY_OUTPUT_PLACEHOLDERS: [&str; 2] = ["${output}", "[output](mention:output)"];

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct Prompt {
    pub id: String,
    pub name: String,
    pub instruction: String,
}

/// Untagged: level names deserialize as built-ins first; any other id is a custom prompt.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(untagged)]
pub enum PromptRef {
    Builtin(PolishLevel),
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Instruction {
    Builtin(PolishLevel),
    Custom(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPrompt {
    pub name: String,
    pub instruction: Instruction,
}

pub(super) fn default_prompts() -> Vec<Prompt> {
    vec![Prompt {
        id: TRANSLATE_PROMPT_ID.to_string(),
        name: "Translate".to_string(),
        instruction: "Translate between French and English. If the text is French, write it in English. If it is English or any other language, write it in French. Translate the meaning, never a look-alike word. Keep the tone, formatting, and line breaks, and leave names, URLs, and code as they are.".to_string(),
    }]
}

pub(super) fn default_polish_prompt() -> PromptRef {
    PromptRef::Builtin(PolishLevel::default())
}

impl AppSettings {
    pub fn resolve_prompt(&self, prompt: &PromptRef) -> Option<ResolvedPrompt> {
        match prompt {
            PromptRef::Builtin(level) => Some(ResolvedPrompt {
                name: level.name().to_string(),
                instruction: Instruction::Builtin(*level),
            }),
            PromptRef::Custom(id) => self
                .prompts
                .iter()
                .find(|custom| &custom.id == id)
                .map(|custom| ResolvedPrompt {
                    name: custom.name.clone(),
                    instruction: Instruction::Custom(custom.instruction.clone()),
                }),
        }
    }

    pub fn dictation_rewrite_prompt(&self) -> Option<ResolvedPrompt> {
        self.dictation_prompt
            .as_ref()
            .and_then(|prompt| self.resolve_prompt(prompt))
    }

    pub fn polish_instruction(&self) -> Instruction {
        self.resolve_prompt(&self.polish_prompt)
            .map_or(Instruction::Builtin(PolishLevel::default()), |prompt| {
                prompt.instruction
            })
    }

    pub fn ensure_prompt_exists(&self, prompt: &PromptRef) -> Result<(), String> {
        match self.resolve_prompt(prompt) {
            Some(_) => Ok(()),
            None => Err(format!("Prompt {prompt:?} not found")),
        }
    }

    pub fn delete_prompt(&mut self, id: &str) -> Result<(), String> {
        let original_len = self.prompts.len();
        self.prompts.retain(|prompt| prompt.id != id);
        if self.prompts.len() == original_len {
            return Err(format!("Prompt '{id}' not found"));
        }
        let deleted = PromptRef::Custom(id.to_string());
        if self.dictation_prompt.as_ref() == Some(&deleted) {
            self.dictation_prompt = None;
        }
        if self.polish_prompt == deleted {
            self.polish_prompt = default_polish_prompt();
        }
        if self.chat_prompt.as_ref() == Some(&deleted) {
            self.chat_prompt = None;
        }
        Ok(())
    }
}

#[derive(Deserialize)]
struct LegacyPrompt {
    id: String,
    name: String,
    prompt: String,
}

fn instruction_without_output_placeholder(prompt: &str) -> String {
    LEGACY_OUTPUT_PLACEHOLDERS
        .iter()
        .fold(prompt.to_string(), |text, placeholder| {
            text.replace(placeholder, "")
        })
        .trim()
        .to_string()
}

fn legacy_dictation_prompt(raw: &serde_json::Value, legacy: &[LegacyPrompt]) -> Option<PromptRef> {
    let enabled = raw
        .get("post_process_enabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    if !enabled {
        return None;
    }
    let selected = raw
        .get("post_process_selected_prompt_id")
        .and_then(serde_json::Value::as_str)
        .filter(|id| !id.is_empty());
    let custom = legacy.iter().find(|prompt| {
        prompt.id != LEGACY_DEFAULT_PROMPT_ID && Some(prompt.id.as_str()) == selected
    });
    Some(match custom {
        Some(prompt) => PromptRef::Custom(prompt.id.clone()),
        None => PromptRef::Builtin(PolishLevel::Correct),
    })
}

/// Runs once, on a store written before `prompts` existed; the legacy keys vanish on rewrite.
pub(super) fn migrate_to_prompt_library(
    settings: &mut AppSettings,
    raw_settings: Option<&serde_json::Value>,
) -> bool {
    let Some(raw) = raw_settings.filter(|raw| raw.get("prompts").is_none()) else {
        return false;
    };
    let legacy = raw
        .get("post_process_prompts")
        .and_then(|prompts| Vec::<LegacyPrompt>::deserialize(prompts).ok())
        .unwrap_or_default();
    settings.dictation_prompt = legacy_dictation_prompt(raw, &legacy);
    settings.prompts = legacy
        .into_iter()
        .filter(|prompt| prompt.id != LEGACY_DEFAULT_PROMPT_ID)
        .map(|prompt| Prompt {
            instruction: instruction_without_output_placeholder(&prompt.prompt),
            id: prompt.id,
            name: prompt.name,
        })
        .chain(default_prompts())
        .collect();
    settings.polish_prompt = PromptRef::Builtin(
        raw.get("polish_level")
            .and_then(|level| PolishLevel::deserialize(level).ok())
            .unwrap_or_default(),
    );
    true
}

#[cfg(test)]
#[path = "settings_prompts_tests.rs"]
mod tests;
