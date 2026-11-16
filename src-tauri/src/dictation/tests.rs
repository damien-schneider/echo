use super::permission::paste_will_land;
use super::{
    hand_over_as_question, hold, landing_for, take_transcript_for_chat, ChatHandover, Destination,
    Landing,
};
use crate::settings::PasteMethod;

#[cfg(target_os = "macos")]
mod paste_deafness {
    use super::super::frontmost_is_paste_deaf;

    const ECHO: &str = "com.damien-schneider.echo";

    /// The desktop reads the pasteboard on Cmd+V yet inserts nothing.
    #[test]
    fn the_desktop_takes_no_paste_when_no_text_field_is_affirmed() {
        assert!(frontmost_is_paste_deaf(
            Some("com.apple.finder"),
            ECHO,
            false
        ));
        assert!(frontmost_is_paste_deaf(Some(ECHO), ECHO, false));
    }

    /// A Finder rename or search field is a real text field — the paste goes through.
    #[test]
    fn an_affirmed_text_field_wins_over_the_deaf_list() {
        assert!(!frontmost_is_paste_deaf(
            Some("com.apple.finder"),
            ECHO,
            true
        ));
    }

    #[test]
    fn ordinary_apps_are_never_presumed_deaf() {
        assert!(!frontmost_is_paste_deaf(Some("dev.zed.Zed"), ECHO, false));
        assert!(!frontmost_is_paste_deaf(None, ECHO, false));
    }
}

#[cfg(target_os = "macos")]
mod placement_confidence {
    use super::super::placement_confidence;
    use crate::caret::CaretSight;
    use crate::clipboard::PasteConfidence;

    #[test]
    fn an_affirmed_caret_vouches_by_itself() {
        for frontmost in [Some("com.unknown.app"), None] {
            assert_eq!(
                placement_confidence(CaretSight::Affirmed, frontmost),
                PasteConfidence::AffirmedCaret
            );
        }
    }

    /// Terminals and Zed hide their caret from accessibility yet insert every paste.
    #[test]
    fn a_blind_probe_in_a_terminal_class_app_trusts_the_read() {
        for app in ["com.mitchellh.ghostty", "dev.zed.Zed", "com.apple.Terminal"] {
            assert_eq!(
                placement_confidence(CaretSight::Blind, Some(app)),
                PasteConfidence::FluentApp
            );
        }
    }

    /// An unknown app's pasteboard read must not silence the card.
    #[test]
    fn a_blind_probe_anywhere_else_stays_unvouched() {
        assert_eq!(
            placement_confidence(CaretSight::Blind, Some("company.thebrowser.dia")),
            PasteConfidence::Unvouched
        );
        assert_eq!(
            placement_confidence(CaretSight::Blind, None),
            PasteConfidence::Unvouched
        );
    }

    /// A denial outranks the app's reputation — even a terminal shows a menu sometimes.
    #[test]
    fn a_denied_focus_stays_unvouched_even_in_a_fluent_app() {
        assert_eq!(
            placement_confidence(CaretSight::DeniedByRole, Some("com.mitchellh.ghostty")),
            PasteConfidence::Unvouched
        );
    }
}

#[test]
fn a_dictation_always_reaches_the_caret_it_was_spoken_into() {
    assert_eq!(landing_for(Destination::Caret, false, true), Landing::Caret);
    assert_eq!(landing_for(Destination::Caret, true, true), Landing::Caret);
}

/// macOS drops a paste keystroke from an app without Accessibility access and reports success.
#[test]
fn a_dictation_echo_may_not_paste_is_kept_instead_of_typed_into_nothing() {
    assert_eq!(
        landing_for(Destination::Caret, false, false),
        Landing::Unpermitted
    );
}

#[test]
fn a_dictation_that_is_only_copied_needs_no_paste_permission() {
    assert!(paste_will_land(PasteMethod::ClipboardOnly, false));
}

#[test]
fn a_pasted_dictation_needs_the_permission_its_keystroke_depends_on() {
    assert!(!paste_will_land(PasteMethod::CtrlV, false));
    assert!(paste_will_land(PasteMethod::CtrlV, true));
}

/// Chat asked for it, so the caret it would have displaced is none of its business.
#[test]
fn chat_dictation_lands_in_the_composer_that_started_it() {
    assert_eq!(
        landing_for(Destination::Chat, true, true),
        Landing::ChatComposer
    );
}

#[test]
fn chat_dictation_reaches_its_composer_without_any_paste_permission() {
    assert_eq!(
        landing_for(Destination::Chat, true, false),
        Landing::ChatComposer
    );
}

#[test]
fn a_chat_closed_mid_dictation_leaves_the_transcript_in_hand() {
    assert_eq!(landing_for(Destination::Chat, false, true), Landing::Held);
}

/// One test for the whole hand-over: the held slot is global, so two would race.
#[test]
fn the_panel_hands_a_question_over_and_the_next_dictation_is_a_draft_again() {
    hold("qui es-tu".to_string());
    hand_over_as_question();
    let question = take_transcript_for_chat().expect("the transcript is still in hand");
    assert_eq!(question.handover, ChatHandover::Ask);
    assert_eq!(question.text, "qui es-tu");

    hold("et toi".to_string());
    let draft = take_transcript_for_chat().expect("the transcript is still in hand");
    assert_eq!(draft.handover, ChatHandover::Compose);
}
