use super::{
    is_key_edge, shortcut_transition, ShortcutEvent, ShortcutExecution, ShortcutTransition,
};
use crate::HeldShortcuts;

fn transition(options: ShortcutTransition) -> ShortcutExecution {
    shortcut_transition(options)
}

#[test]
fn one_shot_actions_execute_only_on_release() {
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: true,
            push_to_talk: true,
            event: ShortcutEvent::Pressed,
        }),
        ShortcutExecution::None
    );
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: true,
            push_to_talk: true,
            event: ShortcutEvent::Released,
        }),
        ShortcutExecution::Start
    );
}

#[test]
fn one_shot_release_is_independent_from_push_to_talk() {
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: true,
            push_to_talk: false,
            event: ShortcutEvent::Released,
        }),
        ShortcutExecution::Start
    );
}

#[test]
fn transcription_keeps_hold_and_toggle_semantics() {
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: false,
            push_to_talk: true,
            event: ShortcutEvent::Pressed,
        }),
        ShortcutExecution::Start
    );
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: false,
            push_to_talk: true,
            event: ShortcutEvent::Released,
        }),
        ShortcutExecution::Stop
    );
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: false,
            push_to_talk: false,
            event: ShortcutEvent::Pressed,
        }),
        ShortcutExecution::Toggle
    );
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: false,
            push_to_talk: false,
            event: ShortcutEvent::Released,
        }),
        ShortcutExecution::None
    );
}

fn edges(state: &HeldShortcuts, events: &[ShortcutEvent]) -> Vec<bool> {
    events
        .iter()
        .map(|event| is_key_edge(state, "transcribe", *event))
        .collect()
}

#[test]
fn auto_repeat_of_a_held_shortcut_is_not_a_new_press() {
    use ShortcutEvent::{Pressed, Released};
    let state = HeldShortcuts::default();
    assert_eq!(
        edges(&state, &[Pressed, Pressed, Pressed, Released, Pressed]),
        vec![true, false, false, true, true]
    );
}

#[test]
fn each_release_of_a_held_shortcut_counts_once() {
    use ShortcutEvent::{Pressed, Released};
    let state = HeldShortcuts::default();
    assert_eq!(
        edges(&state, &[Pressed, Pressed, Released, Released]),
        vec![true, false, true, false]
    );
}

#[test]
fn a_release_never_pressed_is_ignored() {
    let state = HeldShortcuts::default();
    assert_eq!(edges(&state, &[ShortcutEvent::Released]), vec![false]);
}
