use super::model::{EngineType, ModelInfo, POLISH_MODEL_ID};
use super::transcription_profiles::{transcription_profiles, TranscriptionProfileSpec};
use std::collections::HashMap;

const POLISH_MODEL_URL: &str = "https://huggingface.co/lmstudio-community/Qwen3-4B-Instruct-2507-GGUF/resolve/4edb920b6f14e3b9284d4502a6485103d72cde05/Qwen3-4B-Instruct-2507-Q4_K_M.gguf";
const POLISH_MODEL_SHA256: &str =
    "8cdb57cbb880d313736a9bc4e3d3d2485f145b5e19cf33783746e753e82641fc";

/// What the models directory holds for one artifact right now.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct ArtifactState {
    pub(super) is_installed: bool,
    pub(super) partial_size: u64,
}

/// `is_downloading` belongs to the running attempt — clearing it here would let a second transfer hit the same `.partial`.
pub(super) fn apply_artifact_state(model: &mut ModelInfo, artifact: ArtifactState) {
    model.is_downloaded = artifact.is_installed;
    model.partial_size = artifact.partial_size;
}

fn transcription_model_info(profile: &TranscriptionProfileSpec) -> ModelInfo {
    ModelInfo {
        id: profile.id.to_string(),
        name: profile.label.to_string(),
        description: profile.description.to_string(),
        filename: profile.filename.to_string(),
        url: Some(profile.url.to_string()),
        size_mb: profile.size_mb,
        size_bytes: profile.size_bytes,
        sha256: Some(profile.sha256.to_string()),
        is_downloaded: false,
        is_downloading: false,
        partial_size: 0,
        is_directory: false,
        engine_type: EngineType::Whisper,
    }
}

pub(super) fn available_model_catalog() -> HashMap<String, ModelInfo> {
    let mut models = transcription_profiles()
        .iter()
        .map(|profile| (profile.id.to_string(), transcription_model_info(profile)))
        .collect::<HashMap<_, _>>();
    models.insert(
        "diarization-sortformer".to_string(),
        ModelInfo {
            id: "diarization-sortformer".to_string(),
            name: "NVIDIA Sortformer".to_string(),
            description: "End-to-end speaker diarization (max 4 speakers)".to_string(),
            filename: "diar_streaming_sortformer_4spk-v2.onnx".to_string(),
            url: Some("https://huggingface.co/altunenes/parakeet-rs/resolve/main/diar_streaming_sortformer_4spk-v2.onnx".to_string()),
            size_mb: 470,
            size_bytes: 492_243_002,
            sha256: Some("cc520901a8cc25a8d7f7c2c8561a465709b67dd4f1df0572a97530087f3fbc73".to_string()),
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: false,
            engine_type: EngineType::Diarization,
        },
    );
    models.insert(
        POLISH_MODEL_ID.to_string(),
        ModelInfo {
            id: POLISH_MODEL_ID.to_string(),
            name: "Polish".to_string(),
            description: "Private multilingual spelling and grammar correction".to_string(),
            filename: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf".to_string(),
            url: Some(POLISH_MODEL_URL.to_string()),
            size_mb: 2_497,
            size_bytes: 2_497_280_448,
            sha256: Some(POLISH_MODEL_SHA256.to_string()),
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: false,
            engine_type: EngineType::Polish,
        },
    );
    models
}

#[cfg(test)]
mod tests {
    use super::*;

    fn polish_model() -> ModelInfo {
        available_model_catalog().remove(POLISH_MODEL_ID).unwrap()
    }

    #[test]
    fn disk_refresh_never_cancels_an_in_flight_download() {
        let mut model = polish_model();
        model.is_downloading = true;

        apply_artifact_state(
            &mut model,
            ArtifactState {
                is_installed: false,
                partial_size: 1_048_576,
            },
        );

        assert!(model.is_downloading);
        assert_eq!(model.partial_size, 1_048_576);
        assert!(!model.is_downloaded);
    }

    #[test]
    fn installed_artifact_clears_the_resumable_remainder() {
        let mut model = polish_model();
        model.partial_size = 1_048_576;

        apply_artifact_state(
            &mut model,
            ArtifactState {
                is_installed: true,
                partial_size: 0,
            },
        );

        assert!(model.is_downloaded);
        assert_eq!(model.partial_size, 0);
    }

    #[test]
    fn deleted_artifact_leaves_the_catalog_entry_downloadable_again() {
        let mut model = polish_model();
        model.is_downloaded = true;

        apply_artifact_state(
            &mut model,
            ArtifactState {
                is_installed: false,
                partial_size: 0,
            },
        );

        assert!(!model.is_downloaded);
        assert!(model.url.is_some());
    }
}
