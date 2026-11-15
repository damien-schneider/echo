use tauri::AppHandle;

use crate::settings::{self, Prompt, PromptRef};

fn validated_fields(name: &str, instruction: &str) -> Result<(String, String), String> {
    let name = name.trim();
    let instruction = instruction.trim();
    if name.is_empty() || instruction.is_empty() {
        return Err("A prompt needs a name and an instruction".to_string());
    }
    Ok((name.to_string(), instruction.to_string()))
}

#[tauri::command]
pub fn add_prompt(app: AppHandle, name: String, instruction: String) -> Result<Prompt, String> {
    let (name, instruction) = validated_fields(&name, &instruction)?;
    let prompt = Prompt {
        id: format!("prompt_{}", chrono::Utc::now().timestamp_millis()),
        name,
        instruction,
    };
    let added = prompt.clone();
    settings::update_settings(&app, |s| s.prompts.push(prompt));
    Ok(added)
}

#[tauri::command]
pub fn update_prompt(
    app: AppHandle,
    id: String,
    name: String,
    instruction: String,
) -> Result<(), String> {
    let (name, instruction) = validated_fields(&name, &instruction)?;
    settings::try_update_settings(&app, |s| {
        let prompt = s
            .prompts
            .iter_mut()
            .find(|prompt| prompt.id == id)
            .ok_or_else(|| format!("Prompt '{id}' not found"))?;
        prompt.name = name;
        prompt.instruction = instruction;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_prompt(app: AppHandle, id: String) -> Result<(), String> {
    settings::try_update_settings(&app, |s| s.delete_prompt(&id))
}

#[tauri::command]
pub fn set_dictation_prompt(app: AppHandle, prompt: Option<PromptRef>) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        if let Some(prompt) = &prompt {
            s.ensure_prompt_exists(prompt)?;
        }
        s.dictation_prompt = prompt;
        Ok(())
    })
}

#[tauri::command]
pub fn set_polish_prompt(app: AppHandle, prompt: PromptRef) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        s.ensure_prompt_exists(&prompt)?;
        s.polish_prompt = prompt;
        Ok(())
    })
}

#[tauri::command]
pub fn set_chat_prompt(app: AppHandle, prompt: Option<PromptRef>) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        if let Some(prompt) = &prompt {
            s.ensure_prompt_exists(prompt)?;
        }
        s.chat_prompt = prompt;
        Ok(())
    })
}

/// The island has no settings store; it reads the prompt it remembers from here.
#[tauri::command]
pub fn get_chat_prompt(app: AppHandle) -> Option<PromptRef> {
    settings::get_settings(&app).chat_prompt
}
