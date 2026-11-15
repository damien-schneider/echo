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

pub(super) fn default_voice_commands() -> bool {
    true
}

pub(super) fn default_meeting_chunk_duration_secs() -> u32 {
    30
}

pub(super) fn default_cleanup_enabled() -> bool {
    false
}

pub(super) fn default_debug_logging_enabled() -> bool {
    false
}

pub(super) fn default_log_level() -> LogLevel {
    LogLevel::Info
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

pub(super) struct ActionShortcut {
    pub(super) id: &'static str,
    pub(super) name: &'static str,
    description: &'static str,
    pub(super) release: &'static str,
    pub(super) dev: &'static str,
}

pub(super) const ACTION_SHORTCUTS: [ActionShortcut; 2] = [
    ActionShortcut {
        id: "polish",
        name: "Polish",
        description: "Runs your Polish prompt on the selected text.",
        release: "Alt+1",
        dev: "Ctrl+Alt+1",
    },
    ActionShortcut {
        id: "chat",
        name: "Chat",
        description: "Opens the chat with the selected text.",
        release: "Alt+2",
        dev: "Ctrl+Alt+2",
    },
];

impl ActionShortcut {
    pub(super) fn default_shortcut(&self) -> &'static str {
        if cfg!(debug_assertions) {
            self.dev
        } else {
            self.release
        }
    }

    pub(super) fn binding(&self) -> ShortcutBinding {
        ShortcutBinding {
            id: self.id.to_string(),
            name: self.name.to_string(),
            description: self.description.to_string(),
            default_binding: self.default_shortcut().to_string(),
            current_binding: self.default_shortcut().to_string(),
        }
    }
}
