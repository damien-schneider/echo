use tauri::AppHandle;

use crate::settings::{self, LLMPrompt};

fn validate_provider_exists(
    settings: &settings::AppSettings,
    provider_id: &str,
) -> Result<(), String> {
    if !settings
        .post_process_providers
        .iter()
        .any(|provider| provider.id == provider_id)
    {
        return Err(format!("Provider '{}' not found", provider_id));
    }
    Ok(())
}

#[tauri::command]
pub fn change_post_process_base_url_setting(
    app: AppHandle,
    provider_id: String,
    base_url: String,
) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        let label = s
            .post_process_provider(&provider_id)
            .map(|provider| provider.label.clone())
            .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

        let provider = s
            .post_process_provider_mut(&provider_id)
            .expect("Provider looked up above must exist");

        if !provider.allow_base_url_edit {
            return Err(format!(
                "Provider '{}' does not allow editing the base URL",
                label
            ));
        }

        provider.base_url = base_url.clone();
        Ok(())
    })
}

#[tauri::command]
pub fn change_post_process_api_key_setting(
    app: AppHandle,
    provider_id: String,
    api_key: String,
) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        validate_provider_exists(s, &provider_id)?;
        s.post_process_api_keys
            .insert(provider_id.clone(), api_key.clone());
        Ok(())
    })
}

#[tauri::command]
pub fn change_post_process_model_setting(
    app: AppHandle,
    provider_id: String,
    model: String,
) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        validate_provider_exists(s, &provider_id)?;
        s.post_process_models
            .insert(provider_id.clone(), model.clone());
        Ok(())
    })
}

#[tauri::command]
pub fn set_post_process_provider(app: AppHandle, provider_id: String) -> Result<(), String> {
    settings::try_update_settings(&app, |s| {
        validate_provider_exists(s, &provider_id)?;
        s.post_process_provider_id = provider_id.clone();
        Ok(())
    })
}

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
pub async fn fetch_post_process_models(
    app: AppHandle,
    provider_id: String,
) -> Result<Vec<String>, String> {
    let settings = settings::get_settings(&app);

    let provider = settings
        .post_process_providers
        .iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;

    let api_key = settings
        .post_process_api_keys
        .get(&provider_id)
        .cloned()
        .unwrap_or_default();

    // ollama + custom need no key
    if api_key.trim().is_empty() && !["custom", "ollama"].contains(&provider.id.as_str()) {
        return Err(format!(
            "API key is required for {}. Please add an API key to list available models.",
            provider.label
        ));
    }

    fetch_models_manual(provider, api_key).await
}

async fn fetch_models_manual(
    provider: &crate::settings::PostProcessProvider,
    api_key: String,
) -> Result<Vec<String>, String> {
    let (base_url, models_endpoint) = if provider.id == "ollama" {
        // ollama /api/tags sits outside /v1
        let base = provider
            .base_url
            .trim_end_matches('/')
            .trim_end_matches("/v1");
        (base.to_string(), "api/tags".to_string())
    } else {
        let base = provider.base_url.trim_end_matches('/').to_string();
        let endpoint = provider
            .models_endpoint
            .as_ref()
            .map(|s| s.trim_start_matches('/').to_string())
            .unwrap_or_else(|| "models".to_string());
        (base, endpoint)
    };
    let endpoint = format!("{}/{}", base_url, models_endpoint);

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "HTTP-Referer",
        reqwest::header::HeaderValue::from_static("https://github.com/damien-schneider/echo"),
    );
    headers.insert("X-Title", reqwest::header::HeaderValue::from_static("Echo"));

    if provider.id == "anthropic" {
        if !api_key.is_empty() {
            headers.insert(
                "x-api-key",
                reqwest::header::HeaderValue::from_str(&api_key)
                    .map_err(|e| format!("Invalid API key: {}", e))?,
            );
        }
        headers.insert(
            "anthropic-version",
            reqwest::header::HeaderValue::from_static("2023-06-01"),
        );
    } else if !api_key.is_empty() {
        headers.insert(
            "Authorization",
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", api_key))
                .map_err(|e| format!("Invalid API key: {}", e))?,
        );
    }

    let http_client = reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = http_client
        .get(&endpoint)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!(
            "Model list request failed ({}): {}",
            status, error_text
        ));
    }

    let parsed: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let mut models = Vec::new();

    // ollama: { models: [{ name }] }
    if let Some(ollama_models) = parsed.get("models").and_then(|m| m.as_array()) {
        for entry in ollama_models {
            if let Some(name) = entry.get("name").and_then(|n| n.as_str()) {
                models.push(name.to_string());
            }
        }
    }
    // openai: { data: [{ id }] }
    else if let Some(data) = parsed.get("data").and_then(|d| d.as_array()) {
        for entry in data {
            if let Some(id) = entry.get("id").and_then(|i| i.as_str()) {
                models.push(id.to_string());
            } else if let Some(name) = entry.get("name").and_then(|n| n.as_str()) {
                models.push(name.to_string());
            }
        }
    }
    // bare array of names
    else if let Some(array) = parsed.as_array() {
        for entry in array {
            if let Some(model) = entry.as_str() {
                models.push(model.to_string());
            }
        }
    }

    Ok(models)
}

/// `None` when support cannot be determined (custom providers).
#[tauri::command]
pub async fn check_model_tool_support(
    app: AppHandle,
    provider_id: String,
    model: String,
) -> Result<Option<bool>, String> {
    if ["openai", "anthropic", "openrouter"].contains(&provider_id.as_str()) {
        return Ok(Some(true));
    }

    if provider_id == "ollama" {
        let settings = settings::get_settings(&app);
        let provider = settings
            .post_process_providers
            .iter()
            .find(|p| p.id == provider_id)
            .ok_or_else(|| format!("Provider '{}' not found", provider_id))?
            .clone();

        return check_ollama_tool_support(&provider, &model).await;
    }

    Ok(None)
}

async fn check_ollama_tool_support(
    provider: &crate::settings::PostProcessProvider,
    model: &str,
) -> Result<Option<bool>, String> {
    let base = provider
        .base_url
        .trim_end_matches('/')
        .trim_end_matches("/v1");
    let endpoint = format!("{}/api/show", base);

    let body = serde_json::json!({ "model": model });

    let client = reqwest::Client::new();
    let response = client
        .post(&endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to query Ollama model info: {}", e))?;

    if !response.status().is_success() {
        // old Ollama or missing model — unknown, not an error
        return Ok(None);
    }

    let parsed: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama model info: {}", e))?;

    // `capabilities` exists only on recent Ollama
    if let Some(capabilities) = parsed.get("capabilities").and_then(|c| c.as_array()) {
        let supports_tools = capabilities.iter().any(|cap| cap.as_str() == Some("tools"));
        return Ok(Some(supports_tools));
    }

    Ok(None)
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
pub fn change_voice_commands_enabled_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.voice_commands_enabled = enabled;
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
