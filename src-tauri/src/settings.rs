use log::warn;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Once, PoisonError};
use tauri::AppHandle;
use tauri_plugin_log::LogLevel;
use tauri_plugin_store::{Store, StoreExt};

/// Serialises read-modify-write against concurrent command clobbers.
static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

static UNREADABLE_STORE_FILE_CHECK: Once = Once::new();

#[path = "settings_types.rs"]
mod settings_types;
pub use settings_types::*;
#[path = "settings_defaults.rs"]
mod settings_defaults;
use settings_defaults::*;
#[path = "settings_prompts.rs"]
mod settings_prompts;
pub use settings_prompts::*;
#[path = "settings_load.rs"]
mod settings_load;
use settings_load::*;
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
    for shortcut in &ACTION_SHORTCUTS {
        bindings.insert(shortcut.id.to_string(), shortcut.binding());
    }

    AppSettings {
        bindings,
        push_to_talk: true,
        audio_feedback: false,
        audio_feedback_volume: default_audio_feedback_volume(),
        sound_theme: default_sound_theme(),
        start_hidden: default_start_hidden(),
        autostart_enabled: default_autostart_enabled(),
        transcription_model_size: TranscriptionModelSize::default(),
        polish_model_id: None,
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
        prompts: default_prompts(),
        dictation_prompt: None,
        polish_prompt: default_polish_prompt(),
        chat_prompt: None,
        voice_commands: default_voice_commands(),
        mute_while_recording: false,
        input_tracking_enabled: false,
        input_tracking_excluded_apps: Vec::new(),
        input_tracking_idle_timeout: default_input_tracking_idle_timeout(),
        tts_enabled: false,
        meeting_system_audio_enabled: false,
        meeting_auto_summary: false,
        meeting_chunk_duration_secs: default_meeting_chunk_duration_secs(),
        cleanup_enabled: default_cleanup_enabled(),
        cleanup_dictionary: Vec::new(),
    }
}

const REMOVED_PROVIDER_KEYS: [&str; 6] = [
    "post_process_provider_id",
    "post_process_providers",
    "post_process_api_keys",
    "post_process_engine",
    "post_process_models",
    "meeting_summary_engine",
];

/// Rewriting drops stored API keys from disk instead of leaving them until the next settings change.
fn has_removed_provider_keys(raw_settings: Option<&serde_json::Value>) -> bool {
    raw_settings.is_some_and(|raw| {
        REMOVED_PROVIDER_KEYS
            .iter()
            .any(|key| raw.get(key).is_some())
    })
}

/// A store seeded before the profiles diverged still holds the other build's combos — both apps would fire.
fn migrate_shortcuts_to_profile_defaults(settings: &mut AppSettings) -> bool {
    let actions = ACTION_SHORTCUTS
        .iter()
        .map(|shortcut| (shortcut.id, shortcut.default_shortcut(), shortcut.release));
    let profiles = std::iter::once((
        "transcribe",
        get_default_shortcut(),
        release_default_shortcut(),
    ))
    .chain(actions);
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

/// Commands used to run only inside post-processing, so an upgrade must not switch them on alone.
fn migrate_voice_commands_out_of_post_processing(
    settings: &mut AppSettings,
    raw_settings: Option<&serde_json::Value>,
) -> bool {
    let Some(raw) = raw_settings.filter(|raw| raw.get("voice_commands").is_none()) else {
        return false;
    };
    let ran_with_post_processing = raw
        .get("voice_commands_enabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true);
    let post_processing_enabled = raw
        .get("post_process_enabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    settings.voice_commands = ran_with_post_processing && post_processing_enabled;
    true
}

fn apply_settings_migrations_from_raw(
    settings: &mut AppSettings,
    raw_settings: Option<&serde_json::Value>,
) -> bool {
    let mut updated = migrate_shortcuts_to_profile_defaults(settings);
    updated |= has_removed_provider_keys(raw_settings);
    updated |= migrate_voice_commands_out_of_post_processing(settings, raw_settings);

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
        updated = true;
    }

    let original_count = settings.bindings.len();
    settings.bindings.retain(|id, _| {
        let is_valid =
            id == "transcribe" || ACTION_SHORTCUTS.iter().any(|shortcut| shortcut.id == id);
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
    for shortcut in &ACTION_SHORTCUTS {
        if !settings.bindings.contains_key(shortcut.id) {
            settings
                .bindings
                .insert(shortcut.id.to_string(), shortcut.binding());
            updated = true;
        }
    }

    updated |= migrate_to_prompt_library(settings, raw_settings);

    updated
}

fn settings_store(app: &AppHandle) -> Arc<Store<tauri::Wry>> {
    UNREADABLE_STORE_FILE_CHECK.call_once(|| keep_unreadable_store_file(app));
    app.store(SETTINGS_STORE_PATH)
        .expect("Failed to initialize store")
}

fn settings_guard() -> MutexGuard<'static, ()> {
    SETTINGS_LOCK.lock().unwrap_or_else(PoisonError::into_inner)
}

/// None when the stored value needs a write first: first run, migration or recovery.
fn current_settings(app: &AppHandle) -> Option<AppSettings> {
    match settings_store(app)
        .get(SETTINGS_KEY)
        .map(load_stored_settings)
    {
        Some(Ok((settings, false))) => Some(settings),
        _ => None,
    }
}

/// Caller holds SETTINGS_LOCK.
fn load_and_persist_settings(app: &AppHandle) -> AppSettings {
    let store = settings_store(app);
    let load = load_settings(store.get(SETTINGS_KEY));
    for (key, value) in load.store_writes {
        store.set(key, value);
    }
    load.settings
}

pub fn get_settings(app: &AppHandle) -> AppSettings {
    current_settings(app).unwrap_or_else(|| {
        let _guard = settings_guard();
        load_and_persist_settings(app)
    })
}

fn write_settings(app: &AppHandle, settings: AppSettings) {
    if let Some(value) = serialize_settings(&settings) {
        settings_store(app).set(SETTINGS_KEY, value);
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
    let _guard = settings_guard();
    let mut settings = current_settings(app).unwrap_or_else(|| load_and_persist_settings(app));
    f(&mut settings);
    write_settings(app, settings);
}

/// Fallible variant; Err skips write.
pub fn try_update_settings<F>(app: &AppHandle, f: F) -> Result<(), String>
where
    F: FnOnce(&mut AppSettings) -> Result<(), String>,
{
    let _guard = settings_guard();
    let mut settings = current_settings(app).unwrap_or_else(|| load_and_persist_settings(app));
    f(&mut settings)?;
    write_settings(app, settings);
    Ok(())
}

pub fn get_bindings(app: &AppHandle) -> HashMap<String, ShortcutBinding> {
    let settings = get_settings(app);

    settings.bindings
}

pub fn get_stored_binding(app: &AppHandle, id: &str) -> Option<ShortcutBinding> {
    get_bindings(app).remove(id)
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

#[cfg(test)]
#[path = "settings_shortcut_tests.rs"]
mod shortcut_tests;
