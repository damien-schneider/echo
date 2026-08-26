#[cfg(debug_assertions)]
use log::debug;
use log::warn;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_log::LogLevel;
use tauri_plugin_store::StoreExt;

/// Serialises read-modify-write against concurrent command clobbers.
static SETTINGS_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[path = "settings_types.rs"]
mod settings_types;
pub use settings_types::*;
#[path = "settings_defaults.rs"]
mod settings_defaults;
use settings_defaults::*;
pub fn get_default_settings() -> AppSettings {
    let default_shortcut = get_default_shortcut();

    let mut bindings = HashMap::new();
    bindings.insert(
        "transcribe".to_string(),
        ShortcutBinding {
            id: "transcribe".to_string(),
            name: "Transcribe".to_string(),
            description: "Converts your speech into text.".to_string(),
            default_binding: default_shortcut.to_string(),
            current_binding: default_shortcut.to_string(),
        },
    );
    bindings.insert("polish".to_string(), default_polish_binding());

    AppSettings {
        bindings,
        push_to_talk: true,
        audio_feedback: false,
        audio_feedback_volume: default_audio_feedback_volume(),
        sound_theme: default_sound_theme(),
        start_hidden: default_start_hidden(),
        autostart_enabled: default_autostart_enabled(),
        transcription_model_size: TranscriptionModelSize::default(),
        always_on_microphone: false,
        selected_microphone: None,
        clamshell_microphone: None,
        selected_output_device: None,
        translate_to_english: false,
        selected_language: "auto".to_string(),
        overlay_position: OverlayPosition::Edge,
        overlay_dock_edge: OverlayDockEdge::Right,
        overlay_dock_offset: 0.5,
        debug_mode: false,
        debug_logging_enabled: default_debug_logging_enabled(),
        log_level: default_log_level(),
        custom_words: Vec::new(),
        word_correction_threshold: default_word_correction_threshold(),
        double_shift_capture_enabled: default_double_shift_capture_enabled(),
        history_limit: default_history_limit(),
        recording_retention_period: default_recording_retention_period(),
        paste_method: PasteMethod::default(),
        clipboard_handling: ClipboardHandling::default(),
        post_process_provider_id: default_post_process_provider_id(),
        post_process_providers: default_post_process_providers(),
        post_process_api_keys: default_post_process_api_keys(),
        post_process_enabled: false,
        post_process_models: default_post_process_models(),
        post_process_prompts: default_post_process_prompts(),
        post_process_selected_prompt_id: None,
        voice_commands_enabled: default_voice_commands_enabled(),
        mute_while_recording: false,
        input_tracking_enabled: false,
        input_tracking_excluded_apps: Vec::new(),
        input_tracking_idle_timeout: default_input_tracking_idle_timeout(),
        tts_enabled: false,
        meeting_system_audio_enabled: false,
        meeting_system_audio_device: None,
        meeting_auto_summary: false,
        meeting_chunk_duration_secs: default_meeting_chunk_duration_secs(),
        meeting_diarization_threshold: default_diarization_threshold(),
        cleanup_enabled: default_cleanup_enabled(),
        cleanup_app_context_enabled: default_cleanup_app_context_enabled(),
        cleanup_dictionary: Vec::new(),
    }
}

fn default_polish_binding() -> ShortcutBinding {
    ShortcutBinding {
        id: "polish".to_string(),
        name: "Polish".to_string(),
        description: "Fix spelling and grammar in selected text.".to_string(),
        default_binding: get_default_polish_shortcut().to_string(),
        current_binding: get_default_polish_shortcut().to_string(),
    }
}

impl AppSettings {
    pub fn active_post_process_provider(&self) -> Option<&PostProcessProvider> {
        self.post_process_providers
            .iter()
            .find(|provider| provider.id == self.post_process_provider_id)
    }

    pub fn post_process_provider(&self, provider_id: &str) -> Option<&PostProcessProvider> {
        self.post_process_providers
            .iter()
            .find(|provider| provider.id == provider_id)
    }

    pub fn post_process_provider_mut(
        &mut self,
        provider_id: &str,
    ) -> Option<&mut PostProcessProvider> {
        self.post_process_providers
            .iter_mut()
            .find(|provider| provider.id == provider_id)
    }
}

/// A store seeded before the profiles diverged still holds the other build's combos — both apps would fire.
fn migrate_shortcuts_to_profile_defaults(settings: &mut AppSettings) -> bool {
    let profiles = [
        (
            "transcribe",
            get_default_shortcut(),
            release_default_shortcut(),
        ),
        (
            "polish",
            get_default_polish_shortcut(),
            release_default_polish_shortcut(),
        ),
    ];
    let mut updated = false;
    for (id, wanted, foreign) in profiles {
        if wanted == foreign {
            continue;
        }
        let Some(binding) = settings.bindings.get_mut(id) else {
            continue;
        };
        if !binding.current_binding.eq_ignore_ascii_case(foreign) {
            continue;
        }
        warn!("Moving '{id}' off the release shortcut '{foreign}' to '{wanted}'");
        binding.current_binding = wanted.to_string();
        binding.default_binding = wanted.to_string();
        updated = true;
    }
    updated
}

fn apply_settings_migrations_from_raw(
    settings: &mut AppSettings,
    raw_settings: Option<&serde_json::Value>,
) -> bool {
    let mut updated = migrate_shortcuts_to_profile_defaults(settings);

    let has_transcription_model_size = raw_settings
        .and_then(|raw| raw.get("transcription_model_size"))
        .is_some();
    if !has_transcription_model_size {
        let legacy_model = raw_settings
            .and_then(|raw| raw.get("selected_model"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        settings.transcription_model_size = transcription_model_size_from_legacy(legacy_model);
        updated = true;
    }

    let has_overlay_dock_edge = raw_settings
        .and_then(|raw| raw.get("overlay_dock_edge"))
        .is_some();
    if !has_overlay_dock_edge {
        settings.overlay_dock_edge = OverlayDockEdge::Right;
        settings.overlay_dock_offset = 0.5;
        if matches!(
            settings.overlay_position,
            OverlayPosition::Top | OverlayPosition::Bottom
        ) {
            settings.overlay_position = OverlayPosition::Edge;
        }
        updated = true;
    }

    if !settings
        .post_process_providers
        .iter()
        .any(|p| p.id == "ollama")
    {
        // Insert before "custom".
        let insert_pos = settings
            .post_process_providers
            .iter()
            .position(|p| p.id == "custom")
            .unwrap_or(settings.post_process_providers.len());

        settings.post_process_providers.insert(
            insert_pos,
            PostProcessProvider {
                id: "ollama".to_string(),
                label: "Ollama".to_string(),
                base_url: "http://localhost:11434/v1".to_string(),
                allow_base_url_edit: true,
                models_endpoint: Some("/api/tags".to_string()),
            },
        );
        updated = true;
    }

    // drops bindings retired in older versions ('cancel')
    let valid_binding_ids = ["transcribe", "polish", "test"];
    let original_count = settings.bindings.len();
    settings.bindings.retain(|id, _| {
        let is_valid = valid_binding_ids.contains(&id.as_str());
        if !is_valid {
            warn!(
                "Removing stale binding '{}' from settings (no corresponding action)",
                id
            );
        }
        is_valid
    });
    if settings.bindings.len() != original_count {
        updated = true;
    }
    if !settings.bindings.contains_key("polish") {
        settings
            .bindings
            .insert("polish".to_string(), default_polish_binding());
        updated = true;
    }

    if (settings.post_process_selected_prompt_id.is_none()
        || settings
            .post_process_selected_prompt_id
            .as_ref()
            .map(|s| s.is_empty())
            .unwrap_or(true))
        && !settings.post_process_prompts.is_empty()
    {
        if settings
            .post_process_prompts
            .iter()
            .any(|p| p.id == "default_improve_transcriptions")
        {
            settings.post_process_selected_prompt_id =
                Some("default_improve_transcriptions".to_string());
        } else {
            settings.post_process_selected_prompt_id =
                settings.post_process_prompts.first().map(|p| p.id.clone());
        }
        updated = true;
    }

    updated
}

pub fn load_or_create_app_settings(app: &AppHandle) -> AppSettings {
    let store = app
        .store(SETTINGS_STORE_PATH)
        .expect("Failed to initialize store");

    let settings = if let Some(settings_value) = store.get("settings") {
        match serde_json::from_value::<AppSettings>(settings_value.clone()) {
            Ok(mut settings) => {
                #[cfg(debug_assertions)]
                debug!("Found existing settings: {:?}", settings);
                if apply_settings_migrations_from_raw(&mut settings, Some(&settings_value)) {
                    if let Some(value) = serialize_settings(&settings) {
                        store.set("settings", value);
                    }
                }
                settings
            }
            Err(e) => {
                warn!("Failed to parse settings: {}", e);
                let default_settings = get_default_settings();
                if let Some(value) = serialize_settings(&default_settings) {
                    store.set("settings", value);
                }
                default_settings
            }
        }
    } else {
        let default_settings = get_default_settings();
        if let Some(value) = serialize_settings(&default_settings) {
            store.set("settings", value);
        }
        default_settings
    };

    settings
}

pub fn get_settings(app: &AppHandle) -> AppSettings {
    let store = app
        .store(SETTINGS_STORE_PATH)
        .expect("Failed to initialize store");

    if let Some(settings_value) = store.get("settings") {
        match serde_json::from_value::<AppSettings>(settings_value.clone()) {
            Ok(settings) => settings,
            Err(_) => {
                let default_settings = get_default_settings();
                if let Some(value) = serialize_settings(&default_settings) {
                    store.set("settings", value);
                }
                default_settings
            }
        }
    } else {
        let default_settings = get_default_settings();
        if let Some(value) = serialize_settings(&default_settings) {
            store.set("settings", value);
        }
        default_settings
    }
}

pub fn write_settings(app: &AppHandle, settings: AppSettings) {
    let store = app
        .store(SETTINGS_STORE_PATH)
        .expect("Failed to initialize store");

    if let Some(value) = serialize_settings(&settings) {
        store.set("settings", value);
    }
}

fn serialize_settings(settings: &AppSettings) -> Option<serde_json::Value> {
    match serde_json::to_value(settings) {
        Ok(value) => Some(value),
        Err(error) => {
            warn!("Failed to serialize settings: {error}");
            None
        }
    }
}

/// Atomic R-M-W under global lock.
pub fn update_settings<F>(app: &AppHandle, f: F)
where
    F: FnOnce(&mut AppSettings),
{
    let _guard = SETTINGS_LOCK.lock().expect("settings lock poisoned");
    let mut settings = get_settings(app);
    f(&mut settings);
    write_settings(app, settings);
}

/// Fallible variant; Err skips write.
pub fn try_update_settings<F>(app: &AppHandle, f: F) -> Result<(), String>
where
    F: FnOnce(&mut AppSettings) -> Result<(), String>,
{
    let _guard = SETTINGS_LOCK.lock().expect("settings lock poisoned");
    let mut settings = get_settings(app);
    f(&mut settings)?;
    write_settings(app, settings);
    Ok(())
}

pub fn get_bindings(app: &AppHandle) -> HashMap<String, ShortcutBinding> {
    let settings = get_settings(app);

    settings.bindings
}

pub fn get_stored_binding(app: &AppHandle, id: &str) -> ShortcutBinding {
    let bindings = get_bindings(app);

    let binding = bindings.get(id).unwrap().clone();

    binding
}

pub fn get_history_limit(app: &AppHandle) -> usize {
    let settings = get_settings(app);
    settings.history_limit
}

pub fn get_recording_retention_period(app: &AppHandle) -> RecordingRetentionPeriod {
    let settings = get_settings(app);
    settings.recording_retention_period
}

#[cfg(test)]
include!("settings_tests.rs");
