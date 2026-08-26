use super::*;

pub(super) fn default_audio_feedback_volume() -> f32 {
    0.5
}

pub(super) fn default_sound_theme() -> SoundTheme {
    SoundTheme::Marimba
}

pub(super) fn default_always_on_microphone() -> bool {
    false
}

pub(super) fn default_translate_to_english() -> bool {
    false
}

pub(super) fn default_start_hidden() -> bool {
    false
}

pub(super) fn default_autostart_enabled() -> bool {
    false
}

pub(super) fn default_selected_language() -> String {
    "auto".to_string()
}

pub(super) fn resident_overlay_default() -> OverlayPosition {
    OverlayPosition::Edge
}

pub(super) fn default_overlay_position() -> OverlayPosition {
    resident_overlay_default()
}

pub(super) fn default_overlay_dock_edge() -> OverlayDockEdge {
    OverlayDockEdge::Right
}

pub(super) fn default_overlay_dock_offset() -> f64 {
    0.5
}

pub(super) fn default_debug_mode() -> bool {
    false
}

pub(super) fn default_double_shift_capture_enabled() -> bool {
    true
}

pub(super) fn default_word_correction_threshold() -> f64 {
    0.18
}

pub(super) fn default_history_limit() -> usize {
    5
}

pub(super) fn default_recording_retention_period() -> RecordingRetentionPeriod {
    RecordingRetentionPeriod::PreserveLimit
}

pub(super) fn default_input_tracking_idle_timeout() -> Option<u64> {
    Some(2) // Default 2 seconds
}

pub(super) fn default_voice_commands_enabled() -> bool {
    true
}

pub(super) fn default_meeting_chunk_duration_secs() -> u32 {
    30
}

pub(super) fn default_diarization_threshold() -> f32 {
    0.5
}

pub(super) fn default_post_process_provider_id() -> String {
    "openai".to_string()
}

pub(super) fn default_cleanup_enabled() -> bool {
    false
}

pub(super) fn default_cleanup_app_context_enabled() -> bool {
    false
}

pub(super) fn default_debug_logging_enabled() -> bool {
    false
}

pub(super) fn default_log_level() -> LogLevel {
    LogLevel::Info
}

pub(super) fn default_post_process_providers() -> Vec<PostProcessProvider> {
    vec![
        PostProcessProvider {
            id: "openai".to_string(),
            label: "OpenAI".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            allow_base_url_edit: false,
            models_endpoint: Some("/models".to_string()),
        },
        PostProcessProvider {
            id: "openrouter".to_string(),
            label: "OpenRouter".to_string(),
            base_url: "https://openrouter.ai/api/v1".to_string(),
            allow_base_url_edit: false,
            models_endpoint: Some("/models".to_string()),
        },
        PostProcessProvider {
            id: "anthropic".to_string(),
            label: "Anthropic".to_string(),
            base_url: "https://api.anthropic.com/v1".to_string(),
            allow_base_url_edit: false,
            models_endpoint: Some("/models".to_string()),
        },
        PostProcessProvider {
            id: "ollama".to_string(),
            label: "Ollama".to_string(),
            base_url: "http://localhost:11434/v1".to_string(),
            allow_base_url_edit: true,
            models_endpoint: Some("/api/tags".to_string()),
        },
        PostProcessProvider {
            id: "custom".to_string(),
            label: "Custom".to_string(),
            base_url: "http://localhost:8080/v1".to_string(),
            allow_base_url_edit: true,
            models_endpoint: Some("/models".to_string()),
        },
    ]
}

pub(super) fn default_post_process_api_keys() -> HashMap<String, String> {
    let mut map = HashMap::new();
    for provider in default_post_process_providers() {
        map.insert(provider.id, String::new());
    }
    map
}

pub(super) fn default_post_process_models() -> HashMap<String, String> {
    let mut map = HashMap::new();
    for provider in default_post_process_providers() {
        map.insert(provider.id, String::new());
    }
    map
}

pub(super) fn default_post_process_prompts() -> Vec<LLMPrompt> {
    vec![LLMPrompt {
        id: "default_improve_transcriptions".to_string(),
        name: "Improve Transcriptions".to_string(),
        prompt: "Clean this transcript:\n1. Fix spelling, capitalization, and punctuation errors\n2. Convert number words to digits (twenty-five → 25, ten percent → 10%, five dollars → $5)\n3. Replace spoken punctuation with symbols (period → ., comma → ,, question mark → ?)\n4. Remove filler words (um, uh, like as filler)\n5. Keep the language in the original version (if it was french, keep it in french for example)\n\nPreserve exact meaning and word order. Do not paraphrase or reorder content.\n\nReturn only the cleaned transcript.\n\nTranscript:\n${output}".to_string(),
    }]
}

pub const SETTINGS_STORE_PATH: &str = "settings_store.json";

/// Global hotkeys are per-process — a shared combo fires in both the installed and the dev Echo.
pub(super) fn get_default_shortcut() -> &'static str {
    if cfg!(debug_assertions) {
        dev_default_shortcut()
    } else {
        release_default_shortcut()
    }
}

pub(super) fn get_default_polish_shortcut() -> &'static str {
    if cfg!(debug_assertions) {
        dev_default_polish_shortcut()
    } else {
        release_default_polish_shortcut()
    }
}

/// Linux Wayland uses Ctrl+Shift+Space to avoid key leak (shortcuts don't consume events).
pub(super) fn release_default_shortcut() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "ctrl+space"
    }
    #[cfg(target_os = "macos")]
    {
        "option+space"
    }
    #[cfg(target_os = "linux")]
    {
        if std::env::var("XDG_SESSION_TYPE")
            .map(|s| s.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
        {
            "ctrl+shift+space"
        } else {
            "ctrl+space"
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "alt+space"
    }
}

pub(super) fn dev_default_shortcut() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "ctrl+option+space"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "ctrl+alt+space"
    }
}

pub(super) fn release_default_polish_shortcut() -> &'static str {
    "Alt+1"
}

pub(super) fn dev_default_polish_shortcut() -> &'static str {
    "Ctrl+Alt+1"
}
