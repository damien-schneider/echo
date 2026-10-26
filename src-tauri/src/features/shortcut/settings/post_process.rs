use tauri::AppHandle;

use crate::settings::{self, LLMPrompt};

#[tauri::command]
pub fn add_post_process_prompt(
    app: AppHandle,
    name: String,
    prompt: String,
) -> Result<LLMPrompt, String> {
    let id = format!("prompt_{}", chrono::Utc::now().timestamp_millis());

    let new_prompt = LLMPrompt {
        id: id.clone(),
        name,
        prompt,
    };

    let result = new_prompt.clone();
    settings::update_settings(&app, |s| {
        s.post_process_prompts.push(new_prompt);
    });

    Ok(result)
}

#[tauri::command]
pub fn update_post_process_prompt(
    app: AppHandle,
    id: String,
    name: String,
    prompt: String,
) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        if let Some(existing_prompt) = s.post_process_prompts.iter_mut().find(|p| p.id == id) {
            existing_prompt.name = name.clone();
            existing_prompt.prompt = prompt.clone();
            Ok(())
        } else {
            Err(format!("Prompt with id '{}' not found", id))
        }
    })
}

#[tauri::command]
pub fn delete_post_process_prompt(app: AppHandle, id: String) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        if s.post_process_prompts.len() <= 1 {
            return Err("Cannot delete the last prompt".to_string());
        }

        let original_len = s.post_process_prompts.len();
        s.post_process_prompts.retain(|p| p.id != id);

        if s.post_process_prompts.len() == original_len {
            return Err(format!("Prompt with id '{}' not found", id));
        }

        if s.post_process_selected_prompt_id.as_ref() == Some(&id) {
            s.post_process_selected_prompt_id =
                s.post_process_prompts.first().map(|p| p.id.clone());
        }

        Ok(())
    })
}

#[tauri::command]
pub fn set_post_process_selected_prompt(app: AppHandle, id: Option<String>) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        if let Some(prompt_id) = &id {
            if !s.post_process_prompts.iter().any(|p| &p.id == prompt_id) {
                return Err(format!("Prompt with id '{}' not found", prompt_id));
            }
        }

        s.post_process_selected_prompt_id = id.clone();
        Ok(())
    })
}

#[tauri::command]
pub fn change_voice_commands_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.voice_commands = enabled;
    });
    Ok(())
}

#[tauri::command]
pub fn change_post_process_enabled_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.post_process_enabled = enabled;
    });
    Ok(())
}
