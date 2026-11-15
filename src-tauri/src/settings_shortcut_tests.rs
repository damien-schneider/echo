use super::*;

fn action(id: &str) -> &'static ActionShortcut {
    ACTION_SHORTCUTS
        .iter()
        .find(|shortcut| shortcut.id == id)
        .unwrap()
}

#[test]
fn chat_opens_on_the_key_next_to_polish() {
    assert_eq!(action("polish").release, "Alt+1");
    assert_eq!(action("chat").release, "Alt+2");
    assert_eq!(action("chat").dev, "Ctrl+Alt+2");
}

#[test]
fn default_settings_bind_every_action_to_its_profile_shortcut() {
    let settings = get_default_settings();

    for shortcut in &ACTION_SHORTCUTS {
        let binding = &settings.bindings[shortcut.id];
        assert_eq!(binding.name, shortcut.name);
        assert_eq!(binding.default_binding, shortcut.default_shortcut());
        assert_eq!(binding.current_binding, shortcut.default_shortcut());
    }
}

#[test]
fn migration_adds_missing_actions_without_changing_transcription_shortcut() {
    let mut settings = get_default_settings();
    settings.bindings.remove("polish");
    settings.bindings.remove("chat");
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
        settings.bindings["transcribe"].current_binding,
        "Control+Space"
    );
    for shortcut in &ACTION_SHORTCUTS {
        assert_eq!(
            settings.bindings[shortcut.id].current_binding,
            shortcut.default_shortcut()
        );
    }
}

#[test]
fn a_dev_build_never_defaults_to_the_shortcuts_a_release_build_owns() {
    assert_ne!(dev_default_shortcut(), release_default_shortcut());
    for shortcut in &ACTION_SHORTCUTS {
        assert_ne!(shortcut.dev, shortcut.release);
    }
}

#[test]
fn a_store_still_holding_release_shortcuts_follows_the_build_it_runs_in() {
    let mut settings = get_default_settings();
    settings
        .bindings
        .get_mut("transcribe")
        .unwrap()
        .current_binding = release_default_shortcut().to_string();
    for shortcut in &ACTION_SHORTCUTS {
        settings.bindings.get_mut(shortcut.id).unwrap().current_binding =
            shortcut.release.to_string();
    }
    let raw = serde_json::to_value(&settings).unwrap();

    apply_settings_migrations_from_raw(&mut settings, Some(&raw));

    assert_eq!(
        settings.bindings["transcribe"].current_binding,
        get_default_shortcut()
    );
    for shortcut in &ACTION_SHORTCUTS {
        assert_eq!(
            settings.bindings[shortcut.id].current_binding,
            shortcut.default_shortcut()
        );
    }
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
        settings.bindings["transcribe"].current_binding,
        "ctrl+shift+f9"
    );
}

#[test]
fn the_active_defaults_follow_the_build_profile() {
    let expected_transcribe = if cfg!(debug_assertions) {
        dev_default_shortcut()
    } else {
        release_default_shortcut()
    };

    assert_eq!(get_default_shortcut(), expected_transcribe);
    for shortcut in &ACTION_SHORTCUTS {
        let expected = if cfg!(debug_assertions) {
            shortcut.dev
        } else {
            shortcut.release
        };
        assert_eq!(shortcut.default_shortcut(), expected);
    }
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
