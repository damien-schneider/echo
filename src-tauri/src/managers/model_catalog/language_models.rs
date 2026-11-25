use serde::Serialize;

use super::super::model::{EngineType, ModelInfo, POLISH_MODEL_ID};

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Language {
    En,
    Zh,
}

/// What the model's developer documents, not what the model happens to answer in.
#[derive(Clone, Copy, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum LanguageSupport {
    Listed {
        languages: &'static [Language],
        source: &'static str,
    },
    Count {
        count: u16,
        at_least: bool,
        includes_dialects: bool,
        source: &'static str,
    },
    Undocumented,
}

pub(crate) struct PolishModelSpec {
    pub(crate) id: &'static str,
    pub(crate) name: &'static str,
    pub(crate) description: &'static str,
    pub(crate) languages: LanguageSupport,
    /// Measured peak resident memory for one request at a 4096-token context, including mapped weights.
    pub(crate) memory_mb: Option<u64>,
    pub(crate) supports_thinking: bool,
    pub(crate) supports_voice_commands: bool,
    pub(crate) download_size_bytes: u64,
    filename: &'static str,
    url: &'static str,
    sha256: &'static str,
}

impl PolishModelSpec {
    pub(crate) const fn download_size_mb(&self) -> u64 {
        self.download_size_bytes / 1_000_000
    }

    pub(super) fn model_info(&self) -> ModelInfo {
        ModelInfo {
            id: self.id.to_string(),
            name: self.name.to_string(),
            description: self.description.to_string(),
            filename: self.filename.to_string(),
            url: Some(self.url.to_string()),
            size_mb: self.download_size_mb(),
            size_bytes: self.download_size_bytes,
            sha256: Some(self.sha256.to_string()),
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: false,
            engine_type: EngineType::Polish,
        }
    }
}

pub(crate) const POLISH_MODELS: &[PolishModelSpec] = &[
    PolishModelSpec {
        id: POLISH_MODEL_ID,
        name: "Qwen3 4B",
        description: "Writing, spelling, and grammar correction",
        languages: LanguageSupport::Count {
            count: 119,
            at_least: false,
            includes_dialects: true,
            source: "https://qwenlm.github.io/blog/qwen3/",
        },
        memory_mb: Some(3_127),
        supports_thinking: false,
        supports_voice_commands: true,
        download_size_bytes: 2_497_280_448,
        filename: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        url: "https://huggingface.co/lmstudio-community/Qwen3-4B-Instruct-2507-GGUF/resolve/4edb920b6f14e3b9284d4502a6485103d72cde05/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        sha256: "8cdb57cbb880d313736a9bc4e3d3d2485f145b5e19cf33783746e753e82641fc",
    },
    PolishModelSpec {
        id: "polish-gemma-4-e2b-it",
        name: "Gemma 4 E2B",
        description: "Google's model for chat and writing; text only in Echo",
        languages: LanguageSupport::Count {
            count: 35,
            at_least: true,
            includes_dialects: false,
            source: "https://huggingface.co/google/gemma-4-E2B-it",
        },
        memory_mb: None,
        supports_thinking: true,
        supports_voice_commands: false,
        download_size_bytes: 3_427_880_384,
        filename: "gemma-4-E2B-it-Q4_K_M.gguf",
        url: "https://huggingface.co/lmstudio-community/gemma-4-E2B-it-GGUF/resolve/eed445ccfb8aef2e279df1a97e133baf06e443b4/gemma-4-E2B-it-Q4_K_M.gguf",
        sha256: "71e6e8cb64a76da1a734fb8f6ba389d2784950d9902f5e87244fca0a15190c94",
    },
    PolishModelSpec {
        id: "polish-minicpm5-2b",
        name: "MiniCPM5-2B",
        description: "OpenBMB's compact model for chat and writing",
        languages: LanguageSupport::Listed {
            languages: &[Language::En, Language::Zh],
            source: "https://huggingface.co/openbmb/MiniCPM5-2B",
        },
        memory_mb: None,
        supports_thinking: true,
        supports_voice_commands: false,
        download_size_bytes: 1_561_318_368,
        filename: "MiniCPM5-2B-Q4_K_M.gguf",
        url: "https://huggingface.co/openbmb/MiniCPM5-2B-GGUF/resolve/8ad02b786ab81e33d465e1c80562640c55ab2877/MiniCPM5-2B-Q4_K_M.gguf",
        sha256: "ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd",
    },
    PolishModelSpec {
        id: "polish-ling-3-0-tiny",
        name: "Ling 3.0 Tiny",
        description: "Ant Group's mixture-of-experts model; quick for its size",
        languages: LanguageSupport::Undocumented,
        memory_mb: None,
        supports_thinking: true,
        supports_voice_commands: false,
        download_size_bytes: 4_823_894_944,
        filename: "Ling-3.0-tiny-Q4_K_M.gguf",
        url: "https://huggingface.co/inclusionAI/Ling-3.0-tiny-GGUF/resolve/01b850e29ed5b44e2b810160ff980a9bb353296f/Ling-3.0-tiny-Q4_K_M.gguf",
        sha256: "246d67d45f5b0c7447ca0ce0bdb8b46b8a47b593c5068635dc16422c051d7be9",
    },
];
