use crate::audio_feedback::{play_feedback_sound, play_feedback_sound_blocking, SoundType};
use crate::managers::audio::AudioRecordingManager;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use crate::managers::tts::TtsManager;
use crate::overlay::{
    show_recording_overlay, show_transcribing_overlay, show_warning_overlay,
};
use crate::settings::{get_settings, AppSettings};
use crate::tray::{change_tray_icon, TrayIconState};
use crate::utils;
use crate::ManagedToggleState;
use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use log::{debug, error, info};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::AppHandle;
use tauri::{Emitter, Manager};

/// Monotonically increasing counter that increments on every `start()` and `cancel()`.
/// In-flight async tasks capture the current value and bail out when it changes,
/// preventing stale transcription paste, overlay updates, and mute operations.
pub(crate) static OPERATION_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Handle to the most recent async transcription task spawned by `stop()`.
/// On a new stop or cancel we abort the previous handle so stale LLM
/// post-processing API calls don't continue running.
pub(crate) static TRANSCRIPTION_TASK: Lazy<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>> =
    Lazy::new(|| Mutex::new(None));

// Shortcut Action Trait
pub trait ShortcutAction: Send + Sync {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
}

// Transcribe Action
struct TranscribeAction;

async fn maybe_convert_chinese_variant(
    settings: &AppSettings,
    transcription: &str,
) -> Option<String> {
    let is_simplified = settings.selected_language == "zh-Hans";
    let is_traditional = settings.selected_language == "zh-Hant";

    if !is_simplified && !is_traditional {
        debug!("selected_language is not Simplified or Traditional Chinese; skipping conversion");
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

/// Run the dictation cleanup pass on the raw transcript. Thin wrapper
/// around [`cleanup_or_filter`] that also resolves the per-call
/// [`CleanupContext`] from the supplied `AppSettings`.
///
/// Returns empty string for whisper hallucinations (preserves existing
/// "drop attractor strings" behavior on the dictation path), raw text
/// when cleanup is disabled or the manager is not loaded, and cleaned
/// text otherwise.
fn apply_dictation_cleanup(
    app: &AppHandle,
    raw: &str,
    settings: &AppSettings,
) -> String {
    use crate::commands::cleanup::{build_context_from_app_settings, CleanupState};
    use crate::managers::cleanup_apply::cleanup_or_filter;

    let cleanup_state = match app.try_state::<CleanupState>() {
        Some(s) => s.inner().clone(),
        None => {
            // No cleanup state registered (unit-test harness or very
            // early in startup). Behave like cleanup_enabled = false:
            // pass the text through unchanged but DO run the
            // hallucination filter so we never paste an attractor
            // string.
            return if crate::managers::meeting_streaming::is_whisper_hallucination(raw) {
                String::new()
            } else {
                raw.to_string()
            };
        }
    };
    cleanup_or_filter(raw, &cleanup_state, settings, || {
        build_context_from_app_settings(settings)
    })
}

impl ShortcutAction for TranscribeAction {
    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let start_time = Instant::now();
        debug!("TranscribeAction::start called for binding: {}", binding_id);

        // Increment generation to invalidate any in-flight operations from previous recordings
        OPERATION_GENERATION.fetch_add(1, Ordering::SeqCst);

        // Check if a file transcription is currently active
        if crate::is_file_transcription_active() {
            debug!("File transcription in progress - showing warning overlay");
            show_warning_overlay(app, "File transcription in progress. Please wait...");

            // Reset the toggle state so next press will call start() again
            let toggle_state_manager = app.state::<ManagedToggleState>();
            if let Ok(mut states) = toggle_state_manager.lock() {
                states.active_toggles.insert(binding_id.to_string(), false);
            }
            return;
        }

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
            let gen = OPERATION_GENERATION.load(Ordering::SeqCst);
            std::thread::spawn(move || {
                play_feedback_sound_blocking(&app_clone, SoundType::Start);
                if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                    rm_clone.apply_mute();
                }
            });

            let recording_started = rm.try_start_recording(&binding_id);
            if !recording_started {
                // Reset toggle state and revert UI when recording fails to start
                let toggle_state_manager = app.state::<ManagedToggleState>();
                if let Ok(mut states) = toggle_state_manager.lock() {
                    states.active_toggles.insert(binding_id.clone(), false);
                }
                utils::hide_recording_overlay(app);
                change_tray_icon(app, TrayIconState::Idle);
            }
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
                let gen = OPERATION_GENERATION.load(Ordering::SeqCst);
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    debug!("Handling delayed audio feedback/mute sequence");
                    // Helper handles disabled audio feedback by returning early,
                    // so we reuse it to keep mute sequencing consistent in every mode.
                    play_feedback_sound_blocking(&app_clone, SoundType::Start);
                    if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                        rm_clone.apply_mute();
                    }
                });
            } else {
                // Reset toggle state and revert UI when recording fails to start
                let toggle_state_manager = app.state::<ManagedToggleState>();
                if let Ok(mut states) = toggle_state_manager.lock() {
                    states.active_toggles.insert(binding_id.clone(), false);
                }
                utils::hide_recording_overlay(app);
                change_tray_icon(app, TrayIconState::Idle);
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
        let tts_manager = Arc::clone(&app.state::<Arc<TtsManager>>());

        change_tray_icon(app, TrayIconState::Transcribing);
        show_transcribing_overlay(app);

        // Unmute before playing audio feedback so the stop sound is audible
        rm.remove_mute();

        // Play audio feedback for recording stop
        play_feedback_sound(app, SoundType::Stop);

        let binding_id = binding_id.to_string(); // Clone binding_id for the async task
        let rm_for_task = Arc::clone(&rm);

        // Capture current generation to detect staleness
        let gen = OPERATION_GENERATION.load(Ordering::SeqCst);

        // Abort any previous in-flight transcription task
        if let Ok(mut task) = TRANSCRIPTION_TASK.lock() {
            if let Some(handle) = task.take() {
                handle.abort();
            }
        }

        let handle = tauri::async_runtime::spawn(async move {
            let binding_id = binding_id.clone(); // Clone for the inner async task
            debug!(
                "Starting async transcription task for binding: {}",
                binding_id
            );

            let stop_recording_time = Instant::now();
            if let Some(samples) = rm_for_task.stop_recording(&binding_id) {
                debug!(
                    "Recording stopped and samples retrieved in {:?}, sample count: {} ({:.1}s audio)",
                    stop_recording_time.elapsed(),
                    samples.len(),
                    samples.len() as f32 / 16000.0
                );

                // Final transcription: transcribe ALL audio for complete result
                // (streaming preview is limited, but final result is complete)
                let transcription_time = Instant::now();
                let samples_clone = samples.clone(); // Clone full samples for history saving

                match tm.transcribe(samples) {
                    Ok(transcription) => {
                        debug!(
                            "Transcription completed in {:?}: '{}'",
                            transcription_time.elapsed(),
                            transcription
                        );
                        let settings = get_settings(&ah);
                        // Phase 1 cleanup pass: run the on-device
                        // disfluency/punctuation cleanup *before* any
                        // downstream branch (Chinese variant conversion
                        // or frontend AI SDK post-process). The frontend
                        // will see the cleaned text as its "raw" input,
                        // so cloud post-processing (if enabled) layers
                        // on top of local cleanup rather than competing.
                        //
                        // When cleanup_enabled = false this is a pure
                        // pass-through (no LLM call, no lock taken
                        // beyond a settings read), preserving the
                        // existing behavior. The helper also enforces
                        // the hallucination filter, so a transcription
                        // that decodes to a known whisper attractor
                        // becomes "" and the empty-branch below kicks in.
                        let transcription =
                            apply_dictation_cleanup(&ah, &transcription, &settings);
                        if !transcription.is_empty() {
                            if let Some(converted_text) =
                                maybe_convert_chinese_variant(&settings, &transcription).await
                            {
                                // Chinese variant conversion — no LLM needed, finalize directly.
                                let final_text = converted_text.clone();

                                // TTS
                                if settings.tts_enabled {
                                    let tts_clone = tts_manager.clone();
                                    let text_to_speak = final_text.clone();
                                    info!("Triggering TTS with text: {}", text_to_speak);
                                    std::thread::spawn(move || {
                                        if let Err(e) = tts_clone.speak(&text_to_speak) {
                                            error!("TTS failed: {}", e);
                                        }
                                    });
                                }

                                // Save to history
                                let hm_clone = Arc::clone(&hm);
                                let transcription_for_history = transcription.clone();
                                let post_processed = Some(converted_text);
                                tauri::async_runtime::spawn(async move {
                                    if let Err(e) = hm_clone
                                        .save_transcription(
                                            samples_clone,
                                            transcription_for_history,
                                            post_processed,
                                            None,
                                        )
                                        .await
                                    {
                                        error!("Failed to save transcription to history: {}", e);
                                    }
                                });

                                // Staleness check
                                if OPERATION_GENERATION.load(Ordering::SeqCst) != gen {
                                    debug!("Operation became stale during transcription, skipping paste");
                                    return;
                                }

                                // Paste
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
                                    utils::hide_recording_overlay(&ah_clone);
                                    change_tray_icon(&ah_clone, TrayIconState::Idle);
                                })
                                .unwrap_or_else(|e| {
                                    error!("Failed to run paste on main thread: {:?}", e);
                                    if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                                        utils::hide_recording_overlay(&ah);
                                        change_tray_icon(&ah, TrayIconState::Idle);
                                    }
                                });
                            } else {
                                // Emit to frontend for LLM post-processing via AI SDK.
                                // Frontend will call `finalize_transcription` when done.
                                let payload = serde_json::json!({
                                    "transcription": transcription,
                                    "op_generation": gen,
                                    "audio_samples": samples_clone,
                                });
                                if let Err(e) = ah.emit("transcription-ready", payload) {
                                    error!("Failed to emit transcription-ready: {}", e);
                                    // Fallback: paste raw transcription directly
                                    if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                                        let ah_clone = ah.clone();
                                        let raw = transcription.clone();
                                        ah.run_on_main_thread(move || {
                                            let _ = utils::paste(raw, ah_clone.clone());
                                            utils::hide_recording_overlay(&ah_clone);
                                            change_tray_icon(&ah_clone, TrayIconState::Idle);
                                        })
                                        .unwrap_or_else(|_| {
                                            utils::hide_recording_overlay(&ah);
                                            change_tray_icon(&ah, TrayIconState::Idle);
                                        });
                                    }
                                }
                            }
                        } else if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                            utils::hide_recording_overlay(&ah);
                            change_tray_icon(&ah, TrayIconState::Idle);
                        }
                    }
                    Err(err) => {
                        debug!("Global Shortcut Transcription error: {}", err);
                        if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                            utils::hide_recording_overlay(&ah);
                            change_tray_icon(&ah, TrayIconState::Idle);
                        }
                    }
                }
            } else {
                debug!("No samples retrieved from recording stop");
                if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                    utils::hide_recording_overlay(&ah);
                    change_tray_icon(&ah, TrayIconState::Idle);
                }
            }
        });

        // Store the new task handle for potential abortion
        if let Ok(mut task) = TRANSCRIPTION_TASK.lock() {
            *task = Some(handle);
        }

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{get_default_settings, LLMPrompt};

    /// Helper: returns settings with a fully-configured post-processing setup.
    fn settings_with_post_process() -> AppSettings {
        let mut s = get_default_settings();
        s.post_process_enabled = true;
        s.post_process_provider_id = "ollama".to_string();
        s.post_process_models
            .insert("ollama".to_string(), "llama3".to_string());
        s.post_process_prompts = vec![LLMPrompt {
            id: "test_prompt".to_string(),
            name: "Test".to_string(),
            prompt: "Fix this: ${output}".to_string(),
        }];
        s.post_process_selected_prompt_id = Some("test_prompt".to_string());
        s
    }

    /// Validate early-return conditions without needing a full AppHandle.
    fn should_skip_post_process(settings: &AppSettings) -> bool {
        if !settings.post_process_enabled {
            return true;
        }
        if settings.active_post_process_provider().is_none() {
            return true;
        }
        let provider = settings.active_post_process_provider().unwrap();
        let model = settings
            .post_process_models
            .get(&provider.id)
            .cloned()
            .unwrap_or_default();
        if model.trim().is_empty() {
            return true;
        }
        if settings.post_process_selected_prompt_id.is_none() {
            return true;
        }
        let prompt_id = settings.post_process_selected_prompt_id.as_ref().unwrap();
        let prompt = settings
            .post_process_prompts
            .iter()
            .find(|p| &p.id == prompt_id);
        match prompt {
            Some(p) if !p.prompt.trim().is_empty() => false,
            _ => true,
        }
    }

    #[test]
    fn disabled_returns_empty() {
        let mut s = settings_with_post_process();
        s.post_process_enabled = false;
        assert!(
            should_skip_post_process(&s),
            "Should skip when disabled"
        );
    }

    #[test]
    fn no_provider_returns_empty() {
        let mut s = settings_with_post_process();
        s.post_process_provider_id = "nonexistent_provider".to_string();
        assert!(
            should_skip_post_process(&s),
            "Should skip when provider is invalid"
        );
    }

    #[test]
    fn no_model_returns_empty() {
        let mut s = settings_with_post_process();
        s.post_process_models
            .insert("ollama".to_string(), "".to_string());
        assert!(
            should_skip_post_process(&s),
            "Should skip when model is empty"
        );
    }

    #[test]
    fn no_prompt_returns_empty() {
        let mut s = settings_with_post_process();
        s.post_process_selected_prompt_id = None;
        assert!(
            should_skip_post_process(&s),
            "Should skip when no prompt is selected"
        );
    }

    #[test]
    fn valid_settings_should_not_skip() {
        let s = settings_with_post_process();
        assert!(
            !should_skip_post_process(&s),
            "Should not skip with valid settings"
        );
    }
}
