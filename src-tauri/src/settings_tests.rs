#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_transcription_models_map_to_three_sizes() {
        for legacy in ["tiny", "base", "small"] {
            assert_eq!(
                transcription_model_size_from_legacy(legacy),
                TranscriptionModelSize::Small
            );
        }
        for legacy in [
            "medium",
            "turbo",
            "parakeet-tdt-0.6b-v2",
            "parakeet-tdt-0.6b-v3",
        ] {
            assert_eq!(
                transcription_model_size_from_legacy(legacy),
                TranscriptionModelSize::Medium
            );
        }
        assert_eq!(
            transcription_model_size_from_legacy("large"),
            TranscriptionModelSize::Large
        );
    }

    #[test]
    fn missing_or_unknown_legacy_model_uses_medium() {
        assert_eq!(
            transcription_model_size_from_legacy(""),
            TranscriptionModelSize::Medium
        );
        assert_eq!(
            transcription_model_size_from_legacy("unknown-model"),
            TranscriptionModelSize::Medium
        );
    }

    #[test]
    fn transcription_model_size_serializes_as_lowercase() {
        assert_eq!(
            serde_json::to_value(TranscriptionModelSize::Small).unwrap(),
            serde_json::json!("small")
        );
        assert_eq!(
            serde_json::to_value(TranscriptionModelSize::Medium).unwrap(),
            serde_json::json!("medium")
        );
        assert_eq!(
            serde_json::to_value(TranscriptionModelSize::Large).unwrap(),
            serde_json::json!("large")
        );
    }

    #[test]
    fn enabled_false_survives_serialization() {
        let mut settings = get_default_settings();
        settings.post_process_enabled = false;

        let json = serde_json::to_value(&settings).unwrap();
        let deserialized: AppSettings = serde_json::from_value(json).unwrap();

        assert!(
            !deserialized.post_process_enabled,
            "post_process_enabled should remain false after round-trip serialization"
        );
    }

    #[test]
    fn migration_preserves_enabled_flag() {
        let mut settings = get_default_settings();
        settings.post_process_enabled = false;
        // Pre-set prompt so auto-select migration won't fire.
        settings.post_process_selected_prompt_id =
            Some("default_improve_transcriptions".to_string());

        let raw = serde_json::to_value(&settings).unwrap();
        apply_settings_migrations_from_raw(&mut settings, Some(&raw));

        assert!(
            !settings.post_process_enabled,
            "post_process_enabled should remain false after migrations"
        );
    }

    /// Sequential updates via the lock-protected serialization pattern.
    #[test]
    fn sequential_updates_to_different_fields_both_preserved() {
        let mut settings = get_default_settings();

        settings.post_process_enabled = false;
        let json = serde_json::to_value(&settings).unwrap();
        let mut after_first: AppSettings = serde_json::from_value(json).unwrap();

        after_first
            .post_process_models
            .insert("ollama".to_string(), "llama3".to_string());
        let json = serde_json::to_value(&after_first).unwrap();
        let final_settings: AppSettings = serde_json::from_value(json).unwrap();

        assert!(
            !final_settings.post_process_enabled,
            "post_process_enabled should remain false after model update"
        );
        assert_eq!(
            final_settings.post_process_models.get("ollama").unwrap(),
            "llama3",
            "model should be updated"
        );
    }

    #[test]
    fn default_cleanup_disabled() {
        let s = get_default_settings();
        assert!(!s.cleanup_enabled, "cleanup_enabled must default to false");
        assert!(
            !s.cleanup_app_context_enabled,
            "cleanup_app_context_enabled must default to false"
        );
        assert!(s.cleanup_dictionary.is_empty());
    }

    #[test]
    fn dictionary_serialization_roundtrip() {
        let entries = vec![
            DictionaryEntrySetting {
                canonical: "Anthropic".to_string(),
                variants: vec!["anthropics".to_string(), "anth".to_string()],
            },
            DictionaryEntrySetting {
                canonical: "Damien".to_string(),
                variants: Vec::new(),
            },
        ];
        let j = serde_json::to_value(&entries).unwrap();
        let back: Vec<DictionaryEntrySetting> = serde_json::from_value(j).unwrap();
        assert_eq!(back.len(), 2);
        assert_eq!(back[0].canonical, "Anthropic");
        assert_eq!(back[0].variants, vec!["anthropics", "anth"]);
        assert_eq!(back[1].canonical, "Damien");
        assert!(back[1].variants.is_empty());
    }

    #[test]
    fn cleanup_settings_survive_full_settings_roundtrip() {
        let mut s = get_default_settings();
        s.cleanup_enabled = true;
        s.cleanup_app_context_enabled = true;
        s.cleanup_dictionary.push(DictionaryEntrySetting {
            canonical: "Echo".to_string(),
            variants: vec!["eko".to_string()],
        });

        let json = serde_json::to_value(&s).unwrap();
        let back: AppSettings = serde_json::from_value(json).unwrap();

        assert!(back.cleanup_enabled);
        assert!(back.cleanup_app_context_enabled);
        assert_eq!(back.cleanup_dictionary.len(), 1);
        assert_eq!(back.cleanup_dictionary[0].canonical, "Echo");
    }

    #[test]
    fn settings_lock_is_singleton() {
        let guard1 = SETTINGS_LOCK.try_lock();
        assert!(guard1.is_ok(), "First lock should succeed");

        let guard2 = SETTINGS_LOCK.try_lock();
        assert!(
            guard2.is_err(),
            "Second lock should fail while first is held"
        );

        drop(guard1);

        let guard3 = SETTINGS_LOCK.try_lock();
        assert!(guard3.is_ok(), "Lock should succeed after release");
    }

    #[test]
    fn default_settings_include_fixed_polish_shortcut() {
        let settings = get_default_settings();
        let polish = settings.bindings.get("polish").unwrap();

        assert_eq!(polish.name, "Polish");
        assert_eq!(polish.default_binding, get_default_polish_shortcut());
        assert_eq!(polish.current_binding, get_default_polish_shortcut());
    }

    #[test]
    fn resident_island_defaults_to_right_centered_edge() {
        let settings = get_default_settings();

        assert_eq!(resident_overlay_default(), OverlayPosition::Edge);
        assert_eq!(settings.overlay_position, OverlayPosition::Edge);
        assert_eq!(settings.overlay_dock_edge, OverlayDockEdge::Right);
        assert_eq!(settings.overlay_dock_offset, 0.5);
    }

    fn raw_settings_without_dock_metadata(
        position: OverlayPosition,
    ) -> (AppSettings, serde_json::Value) {
        let mut settings = get_default_settings();
        settings.overlay_position = position;
        let mut raw = serde_json::to_value(settings).unwrap();
        let object = raw.as_object_mut().unwrap();
        object.remove("overlay_dock_edge");
        object.remove("overlay_dock_offset");
        let deserialized = serde_json::from_value(raw.clone()).unwrap();
        (deserialized, raw)
    }

    #[test]
    fn legacy_visible_positions_migrate_once_to_right_centered_edge() {
        for legacy_position in [OverlayPosition::Top, OverlayPosition::Bottom] {
            let (mut settings, raw) = raw_settings_without_dock_metadata(legacy_position);

            assert!(apply_settings_migrations_from_raw(
                &mut settings,
                Some(&raw)
            ));
            assert_eq!(settings.overlay_position, OverlayPosition::Edge);
            assert_eq!(settings.overlay_dock_edge, OverlayDockEdge::Right);
            assert_eq!(settings.overlay_dock_offset, 0.5);

            let migrated_raw = serde_json::to_value(&settings).unwrap();
            assert!(migrated_raw.get("overlay_dock_edge").is_some());
            assert!(migrated_raw.get("overlay_dock_offset").is_some());
            assert!(!apply_settings_migrations_from_raw(
                &mut settings,
                Some(&migrated_raw)
            ));
        }
    }

    #[test]
    fn legacy_hidden_position_stays_hidden_with_dock_metadata() {
        let (mut settings, raw) = raw_settings_without_dock_metadata(OverlayPosition::None);

        assert!(apply_settings_migrations_from_raw(
            &mut settings,
            Some(&raw)
        ));
        assert_eq!(settings.overlay_position, OverlayPosition::None);
        assert_eq!(settings.overlay_dock_edge, OverlayDockEdge::Right);
        assert_eq!(settings.overlay_dock_offset, 0.5);
    }

    #[test]
    fn migrated_settings_preserve_every_explicit_position() {
        for position in [
            OverlayPosition::Bottom,
            OverlayPosition::Top,
            OverlayPosition::None,
            OverlayPosition::Edge,
        ] {
            let mut settings = get_default_settings();
            settings.overlay_position = position;
            settings.overlay_dock_edge = OverlayDockEdge::Left;
            settings.overlay_dock_offset = 0.25;
            settings.post_process_selected_prompt_id =
                Some("default_improve_transcriptions".to_string());
            let raw = serde_json::to_value(&settings).unwrap();

            assert!(!apply_settings_migrations_from_raw(
                &mut settings,
                Some(&raw)
            ));
            assert_eq!(settings.overlay_position, position);
            assert_eq!(settings.overlay_dock_edge, OverlayDockEdge::Left);
            assert_eq!(settings.overlay_dock_offset, 0.25);
        }
    }

    #[test]
    fn migration_adds_polish_without_changing_transcription_shortcut() {
        let mut settings = get_default_settings();
        settings.bindings.remove("polish");
        settings
            .bindings
            .get_mut("transcribe")
            .unwrap()
            .current_binding = "Control+Space".to_string();
        let raw = serde_json::to_value(&settings).unwrap();

        assert!(apply_settings_migrations_from_raw(
            &mut settings,
            Some(&raw)
        ));
        assert_eq!(
            settings.bindings.get("transcribe").unwrap().current_binding,
            "Control+Space"
        );
        assert_eq!(
            settings.bindings.get("polish").unwrap().current_binding,
            get_default_polish_shortcut()
        );
    }

    #[test]
    fn a_dev_build_never_defaults_to_the_shortcuts_a_release_build_owns() {
        assert_ne!(dev_default_shortcut(), release_default_shortcut());
        assert_ne!(
            dev_default_polish_shortcut(),
            release_default_polish_shortcut()
        );
    }

    #[test]
    fn a_store_still_holding_release_shortcuts_follows_the_build_it_runs_in() {
        let mut settings = get_default_settings();
        settings
            .bindings
            .get_mut("transcribe")
            .unwrap()
            .current_binding = release_default_shortcut().to_string();
        settings.bindings.get_mut("polish").unwrap().current_binding =
            release_default_polish_shortcut().to_string();
        let raw = serde_json::to_value(&settings).unwrap();

        apply_settings_migrations_from_raw(&mut settings, Some(&raw));

        assert_eq!(
            settings.bindings.get("transcribe").unwrap().current_binding,
            get_default_shortcut()
        );
        assert_eq!(
            settings.bindings.get("polish").unwrap().current_binding,
            get_default_polish_shortcut()
        );
    }

    #[test]
    fn a_shortcut_the_user_chose_survives_the_dev_migration() {
        let mut settings = get_default_settings();
        settings
            .bindings
            .get_mut("transcribe")
            .unwrap()
            .current_binding = "ctrl+shift+f9".to_string();
        let raw = serde_json::to_value(&settings).unwrap();

        apply_settings_migrations_from_raw(&mut settings, Some(&raw));

        assert_eq!(
            settings.bindings.get("transcribe").unwrap().current_binding,
            "ctrl+shift+f9"
        );
    }

    #[test]
    fn the_active_defaults_follow_the_build_profile() {
        let (expected_transcribe, expected_polish) = if cfg!(debug_assertions) {
            (dev_default_shortcut(), dev_default_polish_shortcut())
        } else {
            (release_default_shortcut(), release_default_polish_shortcut())
        };

        assert_eq!(get_default_shortcut(), expected_transcribe);
        assert_eq!(get_default_polish_shortcut(), expected_polish);
    }
}
