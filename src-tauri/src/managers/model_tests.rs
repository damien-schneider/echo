#[cfg(test)]
mod transcription_profile_tests {
    use super::*;
    use crate::settings::TranscriptionModelSize;

    #[test]
    fn production_profiles_are_ordered_small_medium_large() {
        let profiles = transcription_profiles();
        assert_eq!(profiles.len(), 3);
        assert_eq!(profiles[0].size, TranscriptionModelSize::Small);
        assert_eq!(profiles[1].size, TranscriptionModelSize::Medium);
        assert_eq!(profiles[2].size, TranscriptionModelSize::Large);
    }

    #[test]
    fn production_profiles_use_official_quantized_whisper_models() {
        let profiles = transcription_profiles();
        assert_eq!(profiles[0].filename, "ggml-small-q5_1.bin");
        assert_eq!(profiles[0].size_mb, 190);
        assert_eq!(profiles[1].filename, "ggml-large-v3-turbo-q5_0.bin");
        assert_eq!(profiles[1].size_mb, 574);
        assert_eq!(profiles[2].filename, "ggml-large-v3-q5_0.bin");
        assert_eq!(profiles[2].size_mb, 1080);
        assert!(profiles.iter().all(|profile| {
            profile
                .url
                .starts_with("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/")
        }));
        assert!(profiles.iter().all(|profile| profile.sha256.len() == 64));
    }

    #[test]
    fn medium_profile_uses_the_published_artifact_checksum() {
        let medium = transcription_profiles()
            .iter()
            .find(|profile| profile.size == TranscriptionModelSize::Medium)
            .unwrap();

        assert_eq!(
            medium.sha256,
            "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
        );
    }

    #[test]
    fn each_size_resolves_to_its_single_runtime_model_id() {
        assert_eq!(
            transcription_profile_id(TranscriptionModelSize::Small),
            "small"
        );
        assert_eq!(
            transcription_profile_id(TranscriptionModelSize::Medium),
            "medium"
        );
        assert_eq!(
            transcription_profile_id(TranscriptionModelSize::Large),
            "large"
        );
    }

    #[test]
    fn model_checksum_accepts_matching_file_and_rejects_mismatch() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("model.bin");
        std::fs::write(&path, b"abc").unwrap();
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

        assert!(verify_file_sha256(&path, expected).is_ok());
        assert!(verify_file_sha256(
            &path,
            "0000000000000000000000000000000000000000000000000000000000000000"
        )
        .is_err());
    }

    #[test]
    fn profile_ids_match_persisted_size_values() {
        for profile in transcription_profiles() {
            assert_eq!(profile.id, profile.size.as_str());
        }
    }

    #[test]
    fn profile_statuses_derive_active_and_download_state() {
        let statuses = transcription_profile_statuses(TranscriptionModelSize::Medium, |id| {
            (id != "large", id == "small")
        });

        assert_eq!(statuses.len(), 3);
        assert!(!statuses[0].is_active);
        assert!(statuses[0].is_downloaded);
        assert!(statuses[0].is_downloading);
        assert!(statuses[1].is_active);
        assert!(statuses[1].is_downloaded);
        assert!(!statuses[1].is_downloading);
        assert!(!statuses[2].is_active);
        assert!(!statuses[2].is_downloaded);
    }

    #[test]
    fn profile_status_serialization_hides_engine_details() {
        let status =
            transcription_profile_statuses(TranscriptionModelSize::Small, |_| (false, false))
                .remove(0);
        let json = serde_json::to_value(status).unwrap();
        let object = json.as_object().unwrap();

        assert_eq!(object.len(), 7);
        assert!(object.contains_key("size"));
        assert!(object.contains_key("label"));
        assert!(object.contains_key("description"));
        assert!(object.contains_key("download_size_mb"));
        assert!(object.contains_key("is_downloaded"));
        assert!(object.contains_key("is_downloading"));
        assert!(object.contains_key("is_active"));
        assert!(!object.contains_key("filename"));
        assert!(!object.contains_key("url"));
        assert!(!object.contains_key("engine_type"));
    }

    #[test]
    fn polish_model_artifact_is_fixed_and_integrity_checked() {
        let catalog = available_model_catalog();
        let model = catalog.get(POLISH_MODEL_ID).unwrap();

        assert_eq!(model.filename, "Qwen3-4B-Instruct-2507-Q4_K_M.gguf");
        assert_eq!(model.size_bytes, 2_497_280_448);
        assert_eq!(
            model.sha256.as_deref(),
            Some("8cdb57cbb880d313736a9bc4e3d3d2485f145b5e19cf33783746e753e82641fc")
        );
        assert_eq!(model.engine_type, EngineType::Polish);
        assert_eq!(
            model.url.as_deref(),
            Some("https://huggingface.co/lmstudio-community/Qwen3-4B-Instruct-2507-GGUF/resolve/4edb920b6f14e3b9284d4502a6485103d72cde05/Qwen3-4B-Instruct-2507-Q4_K_M.gguf")
        );
    }
}
