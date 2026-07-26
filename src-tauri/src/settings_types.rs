use super::*;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ShortcutBinding {
    pub id: String,
    pub name: String,
    pub description: String,
    pub default_binding: String,
    pub current_binding: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LLMPrompt {
    pub id: String,
    pub name: String,
    pub prompt: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct DictionaryEntrySetting {
    pub canonical: String,
    #[serde(default)]
    pub variants: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PostProcessProvider {
    pub id: String,
    pub label: String,
    pub base_url: String,
    #[serde(default)]
    pub allow_base_url_edit: bool,
    #[serde(default)]
    pub models_endpoint: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OverlayPosition {
    None,
    Edge,
    Top,
    Bottom,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OverlayDockEdge {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptionModelSize {
    Small,
    Medium,
    Large,
}

impl TranscriptionModelSize {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Small => "small",
            Self::Medium => "medium",
            Self::Large => "large",
        }
    }

    pub fn from_model_id(model_id: &str) -> Option<Self> {
        match model_id {
            "small" => Some(Self::Small),
            "medium" => Some(Self::Medium),
            "large" => Some(Self::Large),
            _ => None,
        }
    }
}

impl Default for TranscriptionModelSize {
    fn default() -> Self {
        Self::Medium
    }
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

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClipboardHandling {
    DontModify,
    CopyToClipboard,
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

impl Default for ClipboardHandling {
    fn default() -> Self {
        ClipboardHandling::DontModify
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SoundTheme {
    Marimba,
    Pop,
    Custom,
}

impl SoundTheme {
    fn as_str(&self) -> &'static str {
        match self {
            SoundTheme::Marimba => "marimba",
            SoundTheme::Pop => "pop",
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

/* still echo for composing the initial JSON in the store ------------- */
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
    #[serde(default = "default_history_limit")]
    pub history_limit: usize,
    #[serde(default = "default_recording_retention_period")]
    pub recording_retention_period: RecordingRetentionPeriod,
    #[serde(default)]
    pub paste_method: PasteMethod,
    #[serde(default)]
    pub clipboard_handling: ClipboardHandling,
    #[serde(default = "default_post_process_provider_id")]
    pub post_process_provider_id: String,
    #[serde(default = "default_post_process_providers")]
    pub post_process_providers: Vec<PostProcessProvider>,
    #[serde(default = "default_post_process_api_keys")]
    pub post_process_api_keys: HashMap<String, String>,
    #[serde(default)]
    pub post_process_enabled: bool,
    #[serde(default = "default_post_process_models")]
    pub post_process_models: HashMap<String, String>,
    #[serde(default = "default_post_process_prompts")]
    pub post_process_prompts: Vec<LLMPrompt>,
    #[serde(default)]
    pub post_process_selected_prompt_id: Option<String>,
    #[serde(default = "default_voice_commands_enabled")]
    pub voice_commands_enabled: bool,
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
    pub meeting_system_audio_device: Option<String>,
    #[serde(default)]
    pub meeting_auto_summary: bool,
    #[serde(default = "default_meeting_chunk_duration_secs")]
    pub meeting_chunk_duration_secs: u32,
    #[serde(default = "default_diarization_threshold")]
    pub meeting_diarization_threshold: f32,
    /// Qwen 2.5 1.5B GGUF; defaults off (privacy).
    #[serde(default = "default_cleanup_enabled")]
    pub cleanup_enabled: bool,
    /// Off by default (privacy).
    #[serde(default = "default_cleanup_app_context_enabled")]
    pub cleanup_app_context_enabled: bool,
    #[serde(default)]
    pub cleanup_dictionary: Vec<DictionaryEntrySetting>,
}
