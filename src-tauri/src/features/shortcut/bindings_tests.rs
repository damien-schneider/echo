use std::collections::HashMap;

use super::plan_rebind;
use crate::settings::ShortcutBinding;

fn bindings() -> HashMap<String, ShortcutBinding> {
    [
        ("transcribe", "Transcribe", "option+space"),
        ("polish", "Polish", "Alt+1"),
    ]
    .into_iter()
    .map(|(id, name, combo)| {
        let binding = ShortcutBinding {
            id: id.to_string(),
            name: name.to_string(),
            description: String::new(),
            default_binding: combo.to_string(),
            current_binding: combo.to_string(),
        };
        (id.to_string(), binding)
    })
    .collect()
}

#[test]
fn a_combo_another_echo_shortcut_already_uses_is_refused() {
    let refusal = plan_rebind(&bindings(), "transcribe", "option+1").unwrap_err();

    assert!(refusal.contains("Polish"), "{refusal}");
}

#[test]
fn an_unknown_shortcut_is_refused_instead_of_reported_as_changed() {
    assert!(plan_rebind(&bindings(), "dictate", "ctrl+shift+d").is_err());
}

#[test]
fn a_free_combo_replaces_the_previous_one_and_has_to_be_registered() {
    let rebind = plan_rebind(&bindings(), "transcribe", "ctrl+shift+d").unwrap();

    assert_eq!(rebind.previous.current_binding, "option+space");
    assert_eq!(rebind.updated.current_binding, "ctrl+shift+d");
    assert_eq!(rebind.updated.default_binding, "option+space");
    assert!(rebind.needs_registration(true));
}

#[test]
fn the_combo_a_shortcut_already_holds_is_only_registered_again_after_a_suspend() {
    let rebind = plan_rebind(&bindings(), "polish", "option+1").unwrap();

    assert!(!rebind.needs_registration(true));
    assert!(rebind.needs_registration(false));
}
