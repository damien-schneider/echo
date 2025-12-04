use crate::audio_feedback::{play_feedback_sound, play_feedback_sound_blocking, SoundType};
use crate::managers::audio::AudioRecordingManager;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use crate::overlay::{show_recording_overlay, show_transcribing_overlay};
use crate::settings::{get_settings, AppSettings};
use crate::tray::{change_tray_icon, TrayIconState};
use crate::utils;
use async_openai::types::{
    ChatCompletionRequestMessage, ChatCompletionRequestUserMessageArgs,
    CreateChatCompletionRequestArgs,
};
use log::{debug, error};
use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tauri::AppHandle;
use tauri::{Emitter, Manager};

/// Request payload sent to frontend for AI SDK post-processing
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostProcessRequest {
    pub transcription: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub prompt: String,
    pub request_id: String,
}

/// Response payload received from frontend after AI SDK post-processing
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostProcessResponse {
    pub request_id: String,
    pub text: String,
    pub success: bool,
    pub error: Option<String>,
    pub tool_results: Option<Vec<ToolResult>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub tool_name: String,
    pub result: serde_json::Value,
}

// Shortcut Action Trait
pub trait ShortcutAction: Send + Sync {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
}

// Transcribe Action
struct TranscribeAction;

/// Emit a post-process request to the frontend for AI SDK processing with tools
fn emit_ai_sdk_post_process_request(
    app: &AppHandle,
    settings: &AppSettings,
    transcription: &str,
) -> bool {
    if !(settings.beta_features_enabled && settings.ai_sdk_tools_enabled) {
        return false;
    }

    let provider = match settings.active_post_process_provider().cloned() {
        Some(provider) => provider,
        None => {
            debug!("AI SDK tools enabled but no provider is selected");
            return false;
        }
    };

    let model = settings
        .post_process_models
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    if model.trim().is_empty() {
        debug!("AI SDK tools skipped: no model configured for provider '{}'", provider.id);
        return false;
    }

    let selected_prompt_id = match &settings.post_process_selected_prompt_id {
        Some(id) => id.clone(),
        None => {
            debug!("AI SDK tools skipped: no prompt selected");
            return false;
        }
    };

    let prompt = match settings
        .post_process_prompts
        .iter()
        .find(|p| p.id == selected_prompt_id)
    {
        Some(p) => p.prompt.clone(),
        None => {
            debug!("AI SDK tools skipped: prompt '{}' not found", selected_prompt_id);
            return false;
        }
    };

    let api_key = settings
        .post_process_api_keys
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    let request_id = format!("req_{}", chrono::Utc::now().timestamp_millis());

    let request = PostProcessRequest {
        transcription: transcription.to_string(),
        base_url: provider.base_url.clone(),
        api_key,
        model,
        prompt,
        request_id: request_id.clone(),
    };

    debug!("Emitting AI SDK post-process request: {}", request_id);

    match app.emit("post-process-request", request) {
        Ok(_) => {
            log::info!("[AI SDK Tools] Emitted post-process request to frontend");
            true
        }
        Err(e) => {
            error!("Failed to emit AI SDK post-process request: {}", e);
            false
        }
    }
}

async fn maybe_post_process_transcription(
    settings: &AppSettings,
    transcription: &str,
) -> Option<String> {
    if !settings.beta_features_enabled {
        return None;
    }

    // Skip Rust post-processing if AI SDK tools mode is enabled
    // (frontend will handle it)
    if settings.ai_sdk_tools_enabled {
        debug!("Skipping Rust post-processing: AI SDK tools mode is enabled");
        return None;
    }

    let provider = match settings.active_post_process_provider().cloned() {
        Some(provider) => provider,
        None => {
            debug!("Post-processing enabled but no provider is selected");
            return None;
        }
    };

    let model = settings
        .post_process_models
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    if model.trim().is_empty() {
        debug!(
            "Post-processing skipped because provider '{}' has no model configured",
            provider.id
        );
        return None;
    }

    let selected_prompt_id = match &settings.post_process_selected_prompt_id {
        Some(id) => id.clone(),
        None => {
            debug!("Post-processing skipped because no prompt is selected");
            return None;
        }
    };

    let prompt = match settings
        .post_process_prompts
        .iter()
        .find(|prompt| prompt.id == selected_prompt_id)
    {
        Some(prompt) => prompt.prompt.clone(),
        None => {
            debug!(
                "Post-processing skipped because prompt '{}' was not found",
                selected_prompt_id
            );
            return None;
        }
    };

    if prompt.trim().is_empty() {
        debug!("Post-processing skipped because the selected prompt is empty");
        return None;
    }

    let api_key = settings
        .post_process_api_keys
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    debug!(
        "Starting LLM post-processing with provider '{}' (model: {})",
        provider.id, model
    );

    // Log the original transcription that will be inserted
    log::info!(
        "[Post-Process] Original transcription:\n{}",
        transcription
    );

    // Log the original prompt template (before variable substitution)
    log::info!(
        "[Post-Process] Original prompt template:\n{}",
        prompt
    );

    // Replace mention placeholder with the actual transcription text
    // Handle multiple formats:
    // 1. Platejs remarkMention link format: [output](mention:output) or [any text](mention:output)
    // 2. Legacy ${output} format
    // 3. Simple @output format
    
    // Use regex for flexible matching of [any text](mention:output)
    let mention_regex = regex::Regex::new(r"\[[^\]]*\]\(mention:output\)").unwrap();
    let processed_prompt = mention_regex.replace_all(&prompt, transcription).to_string();
    
    // Also replace ${output} and @output formats for backward compatibility
    let processed_prompt = processed_prompt
        .replace("${output}", transcription)
        .replace("@output", transcription);

    // Log the processed prompt (after variable substitution)
    log::info!(
        "[Post-Process] Prompt with transcript inserted:\n{}",
        processed_prompt
    );

    debug!("Processed prompt length: {} chars", processed_prompt.len());

    // Create OpenAI-compatible client
    let client = match crate::llm_client::create_client(&provider, api_key) {
        Ok(client) => client,
        Err(e) => {
            error!("Failed to create LLM client: {}", e);
            return None;
        }
    };

    // Build the chat completion request
    let message = match ChatCompletionRequestUserMessageArgs::default()
        .content(processed_prompt)
        .build()
    {
        Ok(msg) => ChatCompletionRequestMessage::User(msg),
        Err(e) => {
            error!("Failed to build chat message: {}", e);
            return None;
        }
    };

    let request = match CreateChatCompletionRequestArgs::default()
        .model(&model)
        .messages(vec![message])
        .build()
    {
        Ok(req) => req,
        Err(e) => {
            error!("Failed to build chat completion request: {}", e);
            return None;
        }
    };

    // Send the request
    match client.chat().create(request).await {
        Ok(response) => {
            if let Some(choice) = response.choices.first() {
                if let Some(content) = &choice.message.content {
                    // Log the LLM result
                    log::info!(
                        "[Post-Process] LLM result:\n{}",
                        content
                    );
                    debug!(
                        "LLM post-processing succeeded for provider '{}'. Output length: {} chars",
                        provider.id,
                        content.len()
                    );
                    return Some(content.clone());
                }
            }
            error!("LLM API response has no content");
            None
        }
        Err(e) => {
            error!(
                "LLM post-processing failed for provider '{}': {}. Falling back to original transcription.",
                provider.id,
                e
            );
            None
        }
    }
}

async fn maybe_convert_chinese_variant(
    settings: &AppSettings,
    transcription: &str,
) -> Option<String> {
    let is_simplified = settings.selected_language == "zh-Hans";
    let is_traditional = settings.selected_language == "zh-Hant";

    if !is_simplified && !is_traditional {
        debug!(
            "selected_language is not Simplified or Traditional Chinese; skipping conversion"
        );
        return None;
    }

    debug!(
        "Starting Chinese variant conversion for language: {}",
        settings.selected_language
    );

    let config = if is_simplified {
        BuiltinConfig::Tw2sp
    } else {
        BuiltinConfig::S2twp
    };

    match OpenCC::from_config(config) {
        Ok(converter) => {
            let converted = converter.convert(transcription);
            debug!(
                "OpenCC conversion completed. Input length: {}, Output length: {}",
                transcription.len(),
                converted.len()
            );
            Some(converted)
        }
        Err(e) => {
            error!(
                "Failed to initialize OpenCC converter: {}. Falling back to original transcription.",
                e
            );
            None
        }
    }
}

impl ShortcutAction for TranscribeAction {
    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let start_time = Instant::now();
        debug!("TranscribeAction::start called for binding: {}", binding_id);

        // Load model in the background
        let tm = app.state::<Arc<TranscriptionManager>>();
        tm.initiate_model_load();

        let binding_id = binding_id.to_string();
        change_tray_icon(app, TrayIconState::Recording);
        show_recording_overlay(app);

        let rm = app.state::<Arc<AudioRecordingManager>>();

        // Get the microphone mode to determine audio feedback timing
        let settings = get_settings(app);
        let is_always_on = settings.always_on_microphone;
        debug!("Microphone mode - always_on: {}", is_always_on);

        if is_always_on {
            // Always-on mode: Play audio feedback immediately, then apply mute after sound finishes
            debug!("Always-on mode: Playing audio feedback immediately");
            let rm_clone = Arc::clone(&rm);
            let app_clone = app.clone();
            // The blocking helper exits immediately if audio feedback is disabled,
            // so we can reuse this thread regardless of user settings.
            std::thread::spawn(move || {
                play_feedback_sound_blocking(&app_clone, SoundType::Start);
                rm_clone.apply_mute();
            });

            let recording_started = rm.try_start_recording(&binding_id);
            debug!("Recording started: {}", recording_started);
        } else {
            // On-demand mode: Start recording first, then play audio feedback, then apply mute
            // This allows the microphone to be activated before playing the sound
            debug!("On-demand mode: Starting recording first, then audio feedback");
            let recording_start_time = Instant::now();
            if rm.try_start_recording(&binding_id) {
                debug!("Recording started in {:?}", recording_start_time.elapsed());
                // Small delay to ensure microphone stream is active
                let app_clone = app.clone();
                let rm_clone = Arc::clone(&rm);
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    debug!("Handling delayed audio feedback/mute sequence");
                    // Helper handles disabled audio feedback by returning early,
                    // so we reuse it to keep mute sequencing consistent in every mode.
                    play_feedback_sound_blocking(&app_clone, SoundType::Start);
                    rm_clone.apply_mute();
                });
            } else {
                debug!("Failed to start recording");
            }
        }

        debug!(
            "TranscribeAction::start completed in {:?}",
            start_time.elapsed()
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let stop_time = Instant::now();
        debug!("TranscribeAction::stop called for binding: {}", binding_id);

        let ah = app.clone();
        let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
        let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
        let hm = Arc::clone(&app.state::<Arc<HistoryManager>>());

        change_tray_icon(app, TrayIconState::Transcribing);
        show_transcribing_overlay(app);

        // Unmute before playing audio feedback so the stop sound is audible
        rm.remove_mute();

        // Play audio feedback for recording stop
        play_feedback_sound(app, SoundType::Stop);

        let binding_id = binding_id.to_string(); // Clone binding_id for the async task
        let rm_for_task = Arc::clone(&rm);

        tauri::async_runtime::spawn(async move {
            let binding_id = binding_id.clone(); // Clone for the inner async task
            debug!(
                "Starting async transcription task for binding: {}",
                binding_id
            );

            let stop_recording_time = Instant::now();
            if let Some(samples) = rm_for_task.stop_recording(&binding_id) {
                debug!(
                    "Recording stopped and samples retrieved in {:?}, sample count: {}",
                    stop_recording_time.elapsed(),
                    samples.len()
                );

                let transcription_time = Instant::now();
                let samples_clone = samples.clone(); // Clone for history saving
                match tm.transcribe(samples) {
                    Ok(transcription) => {
                        debug!(
                            "Transcription completed in {:?}: '{}'",
                            transcription_time.elapsed(),
                            transcription
                        );
                        if !transcription.is_empty() {
                            let settings = get_settings(&ah);

                            // Check if AI SDK tools mode is enabled
                            // If so, emit to frontend and let it handle post-processing and pasting
                            if emit_ai_sdk_post_process_request(&ah, &settings, &transcription) {
                                // Save to history with original transcription
                                // (frontend will handle the post-processing)
                                let hm_clone = Arc::clone(&hm);
                                let transcription_for_history = transcription.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Err(e) = hm_clone
                                        .save_transcription(
                                            samples_clone,
                                            transcription_for_history,
                                            None, // Post-processed text will be handled by frontend
                                            None, // Prompt will be handled by frontend
                                        )
                                        .await
                                    {
                                        error!("Failed to save transcription to history: {}", e);
                                    }
                                });

                                // Don't paste or hide overlay here - frontend will do it after AI SDK processing
                                debug!("AI SDK tools mode: frontend will handle post-processing and pasting");
                            } else {
                                // Standard processing path (Rust-based)
                                let mut final_text = transcription.clone();
                                let mut post_processed_text: Option<String> = None;
                                let mut post_process_prompt: Option<String> = None;

                                if let Some(converted_text) =
                                    maybe_convert_chinese_variant(&settings, &transcription).await
                                {
                                    final_text = converted_text.clone();
                                    post_processed_text = Some(converted_text);
                                } else if let Some(processed_text) =
                                    maybe_post_process_transcription(&settings, &transcription).await
                                {
                                    final_text = processed_text.clone();
                                    post_processed_text = Some(processed_text);

                                    // Get the prompt that was used
                                    if let Some(prompt_id) = &settings.post_process_selected_prompt_id {
                                        if let Some(prompt) = settings
                                            .post_process_prompts
                                            .iter()
                                            .find(|p| &p.id == prompt_id)
                                        {
                                            post_process_prompt = Some(prompt.prompt.clone());
                                        }
                                    }
                                }

                                // Save to history with post-processed text and prompt
                                let hm_clone = Arc::clone(&hm);
                                let transcription_for_history = transcription.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Err(e) = hm_clone
                                        .save_transcription(
                                            samples_clone,
                                            transcription_for_history,
                                            post_processed_text,
                                            post_process_prompt,
                                        )
                                        .await
                                    {
                                        error!("Failed to save transcription to history: {}", e);
                                    }
                                });

                                // Paste the final text (either processed or original)
                                let ah_clone = ah.clone();
                                let paste_time = Instant::now();
                                ah.run_on_main_thread(move || {
                                    match utils::paste(final_text, ah_clone.clone()) {
                                        Ok(()) => debug!(
                                            "Text pasted successfully in {:?}",
                                            paste_time.elapsed()
                                        ),
                                        Err(e) => error!("Failed to paste transcription: {}", e),
                                    }
                                    // Hide the overlay after transcription is complete
                                    utils::hide_recording_overlay(&ah_clone);
                                    change_tray_icon(&ah_clone, TrayIconState::Idle);
                                })
                                .unwrap_or_else(|e| {
                                    error!("Failed to run paste on main thread: {:?}", e);
                                    utils::hide_recording_overlay(&ah);
                                    change_tray_icon(&ah, TrayIconState::Idle);
                                });
                            }
                        } else {
                            utils::hide_recording_overlay(&ah);
                            change_tray_icon(&ah, TrayIconState::Idle);
                        }
                    }
                    Err(err) => {
                        debug!("Global Shortcut Transcription error: {}", err);
                        utils::hide_recording_overlay(&ah);
                        change_tray_icon(&ah, TrayIconState::Idle);
                    }
                }
            } else {
                debug!("No samples retrieved from recording stop");
                utils::hide_recording_overlay(&ah);
                change_tray_icon(&ah, TrayIconState::Idle);
            }
        });

        debug!(
            "TranscribeAction::stop completed in {:?}",
            stop_time.elapsed()
        );
    }
}

// Test Action
struct TestAction;

impl ShortcutAction for TestAction {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Started - {} (App: {})", // Changed "Pressed" to "Started" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Stopped - {} (App: {})", // Changed "Released" to "Stopped" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }
}

// Static Action Map
pub static ACTION_MAP: Lazy<HashMap<String, Arc<dyn ShortcutAction>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(
        "transcribe".to_string(),
        Arc::new(TranscribeAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "test".to_string(),
        Arc::new(TestAction) as Arc<dyn ShortcutAction>,
    );
    map
});
