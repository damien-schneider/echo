use super::*;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShortcutBinding {
    pub id: String,
    pub name: String,
    pub description: String,
    pub default_binding: String,
    pub current_binding: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DictionaryEntrySetting {
    pub canonical: String,
    #[serde(default)]
    pub variants: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OverlayPosition {
    None,
    Edge,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OverlayDockEdge {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize,
)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptionModelSize {
    Small,
    #[default]
    Medium,
    Large,
}

pub fn transcription_model_size_from_legacy(model_id: &str) -> TranscriptionModelSize {
    match model_id {
        "tiny" | "base" | "small" => TranscriptionModelSize::Small,
        "large" => TranscriptionModelSize::Large,
        _ => TranscriptionModelSize::Medium,
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PasteMethod {
    CtrlV,
    /// enigo.text() — Linux only; macOS causes terminal suffix dup.
    #[cfg(target_os = "linux")]
    Direct,
    #[cfg(not(target_os = "macos"))]
    ShiftInsert,
    ClipboardOnly,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClipboardHandling {
    #[default]
    DontModify,
    CopyToClipboard,
}

/// How far Polish may go: mistakes only, native phrasing, or clearer structure.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PolishLevel {
    Correct,
    #[default]
    Natural,
    Clear,
}

impl PolishLevel {
    pub const ALL: [Self; 3] = [Self::Correct, Self::Natural, Self::Clear];

    pub fn name(self) -> &'static str {
        match self {
            Self::Correct => "Correct",
            Self::Natural => "Natural",
            Self::Clear => "Clear",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecordingRetentionPeriod {
    Never,
    PreserveLimit,
    Days3,
    Weeks2,
    Months3,
}

impl RecordingRetentionPeriod {
    /// `None` for the periods that are not time based — they keep or count instead.
    pub fn cutoff_timestamp(self, now: i64) -> Option<i64> {
        const DAY: i64 = 24 * 60 * 60;
        match self {
            Self::Never | Self::PreserveLimit => None,
            Self::Days3 => Some(now - 3 * DAY),
            Self::Weeks2 => Some(now - 14 * DAY),
            Self::Months3 => Some(now - 90 * DAY),
        }
    }
}

impl Default for PasteMethod {
    fn default() -> Self {
        #[cfg(target_os = "linux")]
        {
            // Wayland: auto-paste unsupported.
            if crate::wayland::is_wayland() {
                return PasteMethod::ClipboardOnly;
            }
            return PasteMethod::Direct;
        }
        #[cfg(not(target_os = "linux"))]
        return PasteMethod::CtrlV;
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SoundTheme {
    Marimba,
    Custom,
}

impl SoundTheme {
    fn as_str(&self) -> &'static str {
        match self {
            SoundTheme::Marimba => "marimba",
            SoundTheme::Custom => "custom",
        }
    }

    pub fn to_start_path(&self) -> String {
        format!("resources/{}_start.wav", self.as_str())
    }

    pub fn to_stop_path(&self) -> String {
        format!("resources/{}_stop.wav", self.as_str())
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppSettings {
    pub bindings: HashMap<String, ShortcutBinding>,
    pub push_to_talk: bool,
    pub audio_feedback: bool,
    #[serde(default = "default_audio_feedback_volume")]
    pub audio_feedback_volume: f32,
    #[serde(default = "default_sound_theme")]
    pub sound_theme: SoundTheme,
    #[serde(default = "default_start_hidden")]
    pub start_hidden: bool,
    #[serde(default = "default_autostart_enabled")]
    pub autostart_enabled: bool,
    #[serde(default)]
    pub transcription_model_size: TranscriptionModelSize,
    #[serde(default = "default_always_on_microphone")]
    pub always_on_microphone: bool,
    #[serde(default)]
    pub selected_microphone: Option<String>,
    #[serde(default)]
    pub clamshell_microphone: Option<String>,
    #[serde(default)]
    pub selected_output_device: Option<String>,
    #[serde(default = "default_translate_to_english")]
    pub translate_to_english: bool,
    #[serde(default = "default_selected_language")]
    pub selected_language: String,
    #[serde(default = "default_overlay_position")]
    pub overlay_position: OverlayPosition,
    #[serde(default = "default_overlay_dock_edge")]
    pub overlay_dock_edge: OverlayDockEdge,
    #[serde(default = "default_overlay_dock_offset")]
    pub overlay_dock_offset: f64,
    #[serde(default = "default_debug_mode")]
    pub debug_mode: bool,
    #[serde(default = "default_debug_logging_enabled")]
    pub debug_logging_enabled: bool,
    #[serde(default = "default_log_level")]
    pub log_level: LogLevel,
    #[serde(default)]
    pub custom_words: Vec<String>,
    #[serde(default = "default_word_correction_threshold")]
    pub word_correction_threshold: f64,
    #[serde(default = "default_double_shift_capture_enabled")]
    pub double_shift_capture_enabled: bool,
    #[serde(default = "default_history_limit")]
    pub history_limit: usize,
    #[serde(default = "default_recording_retention_period")]
    pub recording_retention_period: RecordingRetentionPeriod,
    #[serde(default)]
    pub paste_method: PasteMethod,
    #[serde(default)]
    pub clipboard_handling: ClipboardHandling,
    #[serde(default = "default_prompts")]
    pub prompts: Vec<Prompt>,
    #[serde(default)]
    pub dictation_prompt: Option<PromptRef>,
    #[serde(default = "default_polish_prompt")]
    pub polish_prompt: PromptRef,
    #[serde(default)]
    pub chat_prompt: Option<PromptRef>,
    #[serde(default = "default_voice_commands")]
    pub voice_commands: bool,
    #[serde(default)]
    pub mute_while_recording: bool,
    #[serde(default)]
    pub input_tracking_enabled: bool,
    #[serde(default)]
    pub input_tracking_excluded_apps: Vec<String>,
    /// Seconds; None/0 = disabled.
    #[serde(default = "default_input_tracking_idle_timeout")]
    pub input_tracking_idle_timeout: Option<u64>,
    #[serde(default)]
    pub tts_enabled: bool,
    #[serde(default)]
    pub meeting_system_audio_enabled: bool,
    #[serde(default)]
    pub meeting_auto_summary: bool,
    #[serde(default = "default_meeting_chunk_duration_secs")]
    pub meeting_chunk_duration_secs: u32,
    #[serde(default = "default_cleanup_enabled")]
    pub cleanup_enabled: bool,
    #[serde(default)]
    pub cleanup_dictionary: Vec<DictionaryEntrySetting>,
}
