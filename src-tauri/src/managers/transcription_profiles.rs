use crate::settings::TranscriptionModelSize;
use serde::Serialize;

const OFFICIAL_WHISPER_MODEL_BASE_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TranscriptionProfileSpec {
    pub description: &'static str,
    pub id: &'static str,
    pub label: &'static str,
    pub sha256: &'static str,
    pub size: TranscriptionModelSize,
    pub filename: &'static str,
    pub url: &'static str,
    pub size_mb: u64,
    pub size_bytes: u64,
}

const TRANSCRIPTION_PROFILES: [TranscriptionProfileSpec; 3] = [
    TranscriptionProfileSpec {
        description: "Fastest multilingual transcription for lower-memory computers.",
        id: "small",
        label: "Small",
        sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
        size: TranscriptionModelSize::Small,
        filename: "ggml-small-q5_1.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
        size_mb: 190,
        size_bytes: 190_085_487,
    },
    TranscriptionProfileSpec {
        description: "Best balance of multilingual accuracy and realtime speed.",
        id: "medium",
        label: "Medium",
        sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
        size: TranscriptionModelSize::Medium,
        filename: "ggml-large-v3-turbo-q5_0.bin",
        url:
            "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
        size_mb: 574,
        size_bytes: 574_041_195,
    },
    TranscriptionProfileSpec {
        description: "Highest multilingual accuracy for powerful computers.",
        id: "large",
        label: "Large",
        sha256: "d75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1",
        size: TranscriptionModelSize::Large,
        filename: "ggml-large-v3-q5_0.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin",
        size_mb: 1080,
        size_bytes: 1_081_140_203,
    },
];

pub fn transcription_profiles() -> &'static [TranscriptionProfileSpec] {
    debug_assert!(TRANSCRIPTION_PROFILES
        .iter()
        .all(|profile| profile.url.starts_with(OFFICIAL_WHISPER_MODEL_BASE_URL)));
    &TRANSCRIPTION_PROFILES
}

pub fn transcription_profile_id(size: TranscriptionModelSize) -> &'static str {
    transcription_profiles()
        .iter()
        .find(|profile| profile.size == size)
        .map_or("medium", |profile| profile.id)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TranscriptionProfileStatus {
    pub description: &'static str,
    pub download_size_mb: u64,
    pub is_active: bool,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub is_recommended: bool,
    pub label: &'static str,
    pub size: TranscriptionModelSize,
}

pub fn transcription_profile_statuses<F>(
    active_size: TranscriptionModelSize,
    model_state: F,
) -> Vec<TranscriptionProfileStatus>
where
    F: Fn(&str) -> (bool, bool),
{
    transcription_profiles()
        .iter()
        .map(|profile| {
            let (is_downloaded, is_downloading) = model_state(profile.id);
            TranscriptionProfileStatus {
                description: profile.description,
                download_size_mb: profile.size_mb,
                is_active: profile.size == active_size,
                is_downloaded,
                is_downloading,
                is_recommended: profile.size == TranscriptionModelSize::default(),
                label: profile.label,
                size: profile.size,
            }
        })
        .collect()
}
