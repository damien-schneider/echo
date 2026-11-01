use super::{
    execute_toggle_transition, is_key_edge, shortcut_transition, ShortcutEvent, ShortcutExecution,
    ShortcutTransition,
};
use crate::ManagedToggleState;

#[test]
fn toggle_action_runs_after_state_lock_is_released() {
    let state = ManagedToggleState::default();
    let mut observed = ShortcutExecution::None;
    let result = execute_toggle_transition(&state, "transcribe", |execution| {
        observed = execution;
        assert!(state.try_lock().is_ok());
    });
    assert_eq!(result, Ok(()));
    assert_eq!(observed, ShortcutExecution::Start);
}

#[test]
fn toggle_state_changes_before_each_action_runs() {
    let state = ManagedToggleState::default();
    let mut executions = Vec::new();
    let first = execute_toggle_transition(&state, "transcribe", |execution| {
        executions.push(execution);
    });
    let second = execute_toggle_transition(&state, "transcribe", |execution| {
        executions.push(execution);
    });
    assert_eq!(first, Ok(()));
    assert_eq!(second, Ok(()));
    assert_eq!(
        executions,
        vec![ShortcutExecution::Start, ShortcutExecution::Stop]
    );
}

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
            is_active: false,
        }),
        ShortcutExecution::None
    );
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: true,
            push_to_talk: true,
            event: ShortcutEvent::Released,
            is_active: false,
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
            is_active: true,
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
            is_active: false,
        }),
        ShortcutExecution::Start
    );
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: false,
            push_to_talk: true,
            event: ShortcutEvent::Released,
            is_active: true,
        }),
        ShortcutExecution::Stop
    );
    assert_eq!(
        transition(ShortcutTransition {
            is_one_shot: false,
            push_to_talk: false,
            event: ShortcutEvent::Pressed,
            is_active: true,
        }),
        ShortcutExecution::Stop
    );
}

fn edges(state: &ManagedToggleState, events: &[ShortcutEvent]) -> Vec<bool> {
    events
        .iter()
        .map(|event| is_key_edge(state, "transcribe", *event))
        .collect()
}

#[test]
fn auto_repeat_of_a_held_shortcut_is_not_a_new_press() {
    use ShortcutEvent::{Pressed, Released};
    let state = ManagedToggleState::default();
    assert_eq!(
        edges(&state, &[Pressed, Pressed, Pressed, Released, Pressed]),
        vec![true, false, false, true, true]
    );
}

#[test]
fn each_release_of_a_held_shortcut_counts_once() {
    use ShortcutEvent::{Pressed, Released};
    let state = ManagedToggleState::default();
    assert_eq!(
        edges(&state, &[Pressed, Pressed, Released, Released]),
        vec![true, false, true, false]
    );
}

#[test]
fn a_release_never_pressed_is_ignored() {
    let state = ManagedToggleState::default();
    assert_eq!(edges(&state, &[ShortcutEvent::Released]), vec![false]);
}
