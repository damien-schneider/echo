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

    #[test]
    fn default_cleanup_disabled() {
        let s = get_default_settings();
        assert!(!s.cleanup_enabled, "cleanup_enabled must default to false");
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
        s.cleanup_dictionary.push(DictionaryEntrySetting {
            canonical: "Echo".to_string(),
            variants: vec!["eko".to_string()],
        });

        let json = serde_json::to_value(&s).unwrap();
        let back: AppSettings = serde_json::from_value(json).unwrap();

        assert!(back.cleanup_enabled);
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
            (
                release_default_shortcut(),
                release_default_polish_shortcut(),
            )
        };

        assert_eq!(get_default_shortcut(), expected_transcribe);
        assert_eq!(get_default_polish_shortcut(), expected_polish);
    }

    #[test]
    fn a_store_from_the_provider_era_loads_and_is_rewritten_without_provider_keys() {
        let mut clean = get_default_settings();
        clean.post_process_enabled = true;
        clean.post_process_selected_prompt_id = Some("default_improve_transcriptions".to_string());
        let clean_raw = serde_json::to_value(&clean).unwrap();
        let mut legacy_raw = clean_raw.clone();
        legacy_raw.as_object_mut().unwrap().extend([
            ("post_process_engine".to_string(), serde_json::json!("cloud")),
            ("meeting_summary_engine".to_string(), serde_json::json!("cloud")),
            (
                "post_process_api_keys".to_string(),
                serde_json::json!({ "openai": "sk-stored" }),
            ),
            (
                "post_process_providers".to_string(),
                serde_json::json!([{ "id": "openai", "label": "OpenAI", "base_url": "https://api.openai.com/v1" }]),
            ),
            (
                "post_process_models".to_string(),
                serde_json::json!({ "openai": "gpt-4o-mini" }),
            ),
            ("post_process_provider_id".to_string(), serde_json::json!("openai")),
        ]);

        let mut legacy: AppSettings = serde_json::from_value(legacy_raw.clone()).unwrap();
        assert!(legacy.post_process_enabled);
        assert!(apply_settings_migrations_from_raw(&mut legacy, Some(&legacy_raw)));
        assert!(!apply_settings_migrations_from_raw(&mut clean, Some(&clean_raw)));

        let rewritten = serde_json::to_value(&legacy).unwrap();
        for key in REMOVED_PROVIDER_KEYS {
            assert!(rewritten.get(key).is_none(), "{key} should not be written back");
        }
    }

    #[test]
    fn a_stored_pop_sound_theme_loads_as_marimba_and_is_rewritten() {
        let mut raw = serde_json::to_value(get_default_settings()).unwrap();
        raw["sound_theme"] = serde_json::json!("pop");

        let (settings, rewrite) = load_stored_settings(raw).unwrap();

        assert_eq!(settings.sound_theme, SoundTheme::Marimba);
        assert!(rewrite);
    }

    #[test]
    fn a_stored_test_shortcut_is_dropped() {
        let mut settings = get_default_settings();
        let transcribe = settings.bindings["transcribe"].clone();
        settings.bindings.insert(
            "test".to_string(),
            ShortcutBinding {
                id: "test".to_string(),
                ..transcribe
            },
        );
        let raw = serde_json::to_value(&settings).unwrap();

        let (loaded, rewrite) = load_stored_settings(raw).unwrap();

        assert!(!loaded.bindings.contains_key("test"));
        assert!(rewrite);
    }

    fn a_store_from_before_voice_commands_stood_alone(
        post_process: bool,
        voice_commands: bool,
    ) -> serde_json::Value {
        let mut raw = serde_json::to_value(get_default_settings()).unwrap();
        let fields = raw.as_object_mut().unwrap();
        fields.remove("voice_commands");
        fields.insert("post_process_enabled".into(), serde_json::json!(post_process));
        fields.insert("voice_commands_enabled".into(), serde_json::json!(voice_commands));
        raw
    }

    #[test]
    fn an_upgrade_keeps_voice_commands_only_where_post_processing_ran_them() {
        for (post_process, stored, expected) in [
            (false, true, false),
            (true, true, true),
            (true, false, false),
            (false, false, false),
        ] {
            let raw = a_store_from_before_voice_commands_stood_alone(post_process, stored);

            let (loaded, rewrite) = load_stored_settings(raw).unwrap();

            assert_eq!(
                loaded.voice_commands, expected,
                "post-processing {post_process}, stored voice commands {stored}"
            );
            assert!(rewrite);
        }
    }

    #[test]
    fn voice_commands_chosen_after_the_upgrade_stay_as_chosen() {
        let mut settings = get_default_settings();
        settings.post_process_enabled = false;
        settings.voice_commands = true;
        let raw = serde_json::to_value(&settings).unwrap();

        let (loaded, _) = load_stored_settings(raw).unwrap();

        assert!(loaded.voice_commands);
    }
}
