//! Where a finished dictation lands: the caret it was dictated into, the chat composer that asked for
//! it, or Echo's own hands when there is nowhere to put it.

use crate::overlay;
use crate::settings::OverlayPosition;
use log::error;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex, MutexGuard, PoisonError,
};
use tauri::AppHandle;

/// The binding a dictation starts from is what decides where its transcript goes.
pub(crate) const CHAT_BINDING_ID: &str = "chat_dictation";

static ROUTES_TO_CHAT: AtomicBool = AtomicBool::new(false);
static HELD_TRANSCRIPT: Mutex<Option<HeldTranscript>> = Mutex::new(None);
#[cfg(target_os = "macos")]
static SPOKEN_CARET_SIGHT: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

/// What the chat composer does with a transcript handed to it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ChatHandover {
    /// Dictated into the composer, so the user is still writing.
    Compose,
    /// Handed over whole, so chat asks it as it stands.
    Ask,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct HeldTranscript {
    handover: ChatHandover,
    text: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Destination {
    Caret,
    Chat,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Landing {
    Caret,
    ChatComposer,
    /// Echo keeps the text and offers it — copy it, or send it to chat.
    Held,
}

/// A caret dictation always pastes — predicting the caret proved unreliable, so the clipboard is
/// the net instead. Only a chat transcript that lost its composer is held out to the user.
pub(crate) fn landing_for(destination: Destination, chat_is_open: bool) -> Landing {
    match destination {
        Destination::Chat if chat_is_open => Landing::ChatComposer,
        Destination::Chat => Landing::Held,
        Destination::Caret => Landing::Caret,
    }
}

pub(crate) fn begin(binding_id: &str) {
    ROUTES_TO_CHAT.store(binding_id == CHAT_BINDING_ID, Ordering::Release);
    #[cfg(target_os = "macos")]
    {
        crate::macos_accessibility::coax_frontmost_into_answering();
        SPOKEN_CARET_SIGHT.store(
            sight_rank(crate::macos_accessibility::sight_focused_caret()),
            Ordering::Release,
        );
    }
}

#[cfg(target_os = "macos")]
fn sight_rank(sight: crate::macos_accessibility::CaretSight) -> u8 {
    use crate::macos_accessibility::CaretSight;
    match sight {
        CaretSight::Blind => 0,
        CaretSight::DeniedByRole => 1,
        CaretSight::Affirmed => 2,
    }
}

#[cfg(target_os = "macos")]
fn sight_from_rank(rank: u8) -> crate::macos_accessibility::CaretSight {
    use crate::macos_accessibility::CaretSight;
    match rank {
        2 => CaretSight::Affirmed,
        1 => CaretSight::DeniedByRole,
        _ => CaretSight::Blind,
    }
}

pub(crate) fn routes_to_chat() -> bool {
    ROUTES_TO_CHAT.load(Ordering::Acquire)
}

fn held() -> MutexGuard<'static, Option<HeldTranscript>> {
    HELD_TRANSCRIPT
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

fn hold(text: String) {
    *held() = Some(HeldTranscript {
        handover: ChatHandover::Compose,
        text,
    });
}

pub(crate) fn drop_held_transcript() {
    held().take();
}

/// The panel hands the transcript over whole, so chat asks it instead of waiting for more typing.
pub(crate) fn hand_over_as_question() {
    if let Some(transcript) = held().as_mut() {
        transcript.handover = ChatHandover::Ask;
    }
}

/// The caret Echo was spoken into counts as much as the one at delivery: by then Echo's own surface
/// may hold the focus, and an app that only builds its accessibility tree once asked answers on the
/// second read. The two probes combine by the most they could establish.
#[cfg(target_os = "macos")]
fn combined_caret_sight() -> crate::macos_accessibility::CaretSight {
    let spoken = sight_from_rank(SPOKEN_CARET_SIGHT.load(Ordering::Acquire));
    spoken.max(crate::macos_accessibility::sight_focused_caret())
}

/// Frontmost surfaces a text Cmd+V cannot land in — yet Finder still reads the pasteboard on the
/// keystroke, faking the paste receipt. With no text field affirmed either, pasting is pointless:
/// the transcript goes straight to the held-out card instead.
#[cfg(target_os = "macos")]
const PASTE_DEAF_BUNDLE_IDS: &[&str] = &["com.apple.finder", "com.apple.dock"];

/// Blind to accessibility yet demonstrably paste-fluent: these render their own text and expose no
/// caret, but their Cmd+V inserts every paste — so their pasteboard read is a real receipt. Any
/// blind app not on this list gets the paste and the card both, since a read alone proves nothing.
#[cfg(target_os = "macos")]
const PASTE_FLUENT_BUNDLE_IDS: &[&str] = &[
    "com.apple.Terminal",
    "com.googlecode.iterm2",
    "com.mitchellh.ghostty",
    "net.kovidgoyal.kitty",
    "org.alacritty",
    "dev.warp.Warp-Stable",
    "com.github.wez.wezterm",
    "dev.zed.Zed",
    "dev.zed.Zed-Preview",
    "dev.zed.Zed-Dev",
    "com.sublimetext.4",
];

#[cfg(target_os = "macos")]
fn placement_confidence(
    sight: crate::macos_accessibility::CaretSight,
    frontmost: Option<&str>,
) -> crate::clipboard::PasteConfidence {
    use crate::clipboard::PasteConfidence;
    use crate::macos_accessibility::CaretSight;
    match sight {
        CaretSight::Affirmed => PasteConfidence::AffirmedCaret,
        CaretSight::Blind
            if frontmost.is_some_and(|bundle_id| PASTE_FLUENT_BUNDLE_IDS.contains(&bundle_id)) =>
        {
            PasteConfidence::FluentApp
        }
        CaretSight::Blind | CaretSight::DeniedByRole => PasteConfidence::Unvouched,
    }
}

#[cfg(target_os = "macos")]
fn frontmost_is_paste_deaf(
    frontmost: Option<&str>,
    echo_identifier: &str,
    caret_was_affirmed: bool,
) -> bool {
    if caret_was_affirmed {
        return false;
    }
    frontmost.is_some_and(|bundle_id| {
        PASTE_DEAF_BUNDLE_IDS.contains(&bundle_id) || bundle_id == echo_identifier
    })
}

/// Fires from the paste settlement task when no app took the paste, so the hop back to the main
/// thread and the held-out card happen only on a confirmed miss.
fn offer_when_unplaced(app_handle: &AppHandle) -> Box<dyn FnOnce(String) + Send + 'static> {
    let app_handle = app_handle.clone();
    Box::new(move |text| {
        let on_main = app_handle.clone();
        let scheduled = app_handle.run_on_main_thread(move || hold_out(&on_main, text));
        if let Err(error) = scheduled {
            error!("Failed to offer the transcript nothing pasted: {error:?}");
        }
    })
}

/// The single exit of every dictation — both the direct and the post-processed one end here.
pub(crate) fn deliver(app_handle: &AppHandle, text: String) {
    if text.trim().is_empty() {
        abandon(app_handle);
        return;
    }
    let destination = if routes_to_chat() {
        Destination::Chat
    } else {
        Destination::Caret
    };
    match landing_for(destination, overlay::chat_surface_is_open()) {
        Landing::Caret => deliver_to_caret(app_handle, text),
        Landing::ChatComposer => {
            hold(text);
            overlay::hand_transcript_to_chat(app_handle);
        }
        Landing::Held => hold_out(app_handle, text),
    }
}

/// The probe's verdict routes the delivery: an affirmed caret pastes silently; a focus that cannot
/// take text still gets the paste (a free shot) but the card comes up at once, since such apps read
/// the pasteboard on Cmd+V and fake the receipt; a blind probe pastes and lets the receipt decide.
#[cfg(target_os = "macos")]
fn deliver_to_caret(app_handle: &AppHandle, text: String) {
    use crate::macos_accessibility::CaretSight;
    use crate::managers::app_context::{FocusedAppProvider, PlatformFocusedAppProvider};

    let sight = combined_caret_sight();
    let frontmost = PlatformFocusedAppProvider
        .current()
        .and_then(|app| app.bundle_id);
    log::info!("deliver: caret sight {sight:?}, frontmost {frontmost:?}");
    let affirmed = sight == CaretSight::Affirmed;
    if frontmost_is_paste_deaf(
        frontmost.as_deref(),
        &tauri::Manager::config(app_handle).identifier,
        affirmed,
    ) {
        hold_out(app_handle, text);
        return;
    }
    let confidence = placement_confidence(sight, frontmost.as_deref());
    let on_unplaced = match sight {
        CaretSight::DeniedByRole => no_offer_the_card_is_already_up(),
        CaretSight::Affirmed | CaretSight::Blind => offer_when_unplaced(app_handle),
    };
    if let Err(error) = crate::clipboard::paste(&text, app_handle, confidence, on_unplaced) {
        error!("Failed to paste transcription: {error}");
        hold_out(app_handle, text);
        return;
    }
    if sight == CaretSight::DeniedByRole {
        hold_out(app_handle, text);
    }
}

#[cfg(target_os = "macos")]
fn no_offer_the_card_is_already_up() -> Box<dyn FnOnce(String) + Send + 'static> {
    Box::new(|_| {})
}

#[cfg(not(target_os = "macos"))]
fn deliver_to_caret(app_handle: &AppHandle, text: String) {
    let offer = offer_when_unplaced(app_handle);
    let confidence = crate::clipboard::PasteConfidence::AffirmedCaret;
    if let Err(error) = crate::clipboard::paste(&text, app_handle, confidence, offer) {
        error!("Failed to paste transcription: {error}");
        hold_out(app_handle, text);
    }
}

/// With the overlay switched off there is no surface to offer the text on, and the clipboard is all that is left.
fn hold_out(app_handle: &AppHandle, text: String) {
    if crate::settings::get_settings(app_handle).overlay_position == OverlayPosition::None {
        if let Err(error) = crate::clipboard::copy_to_clipboard(&text, app_handle) {
            error!("Failed to keep the transcription anywhere: {error}");
        }
        return;
    }
    hold(text);
    if let Err(error) = overlay::show_held_transcript(app_handle) {
        error!("Failed to offer the transcript Echo could not place: {error}");
    }
}

/// Nothing to deliver — a chat composer waiting on this dictation still has to stop waiting.
pub(crate) fn abandon(app_handle: &AppHandle) {
    if routes_to_chat() {
        overlay::hand_transcript_to_chat(app_handle);
    }
}

#[tauri::command]
pub(crate) fn get_held_transcript() -> Option<String> {
    held().as_ref().map(|transcript| transcript.text.clone())
}

/// Consumed by the chat composer — a transcript shown once must not reappear on the next chat.
#[tauri::command]
pub(crate) fn take_transcript_for_chat() -> Option<HeldTranscript> {
    held().take()
}

#[tauri::command]
pub(crate) fn copy_held_transcript(app_handle: AppHandle) -> Result<(), String> {
    let text = get_held_transcript().ok_or_else(|| "No transcript to copy".to_string())?;
    crate::clipboard::copy_to_clipboard(&text, &app_handle)
}

#[cfg(test)]
mod tests {
    use super::{
        hand_over_as_question, hold, landing_for, take_transcript_for_chat, ChatHandover,
        Destination, Landing,
    };

    #[cfg(target_os = "macos")]
    mod paste_deafness {
        use super::super::frontmost_is_paste_deaf;

        const ECHO: &str = "com.damien-schneider.echo";

        /// The desktop reads the pasteboard on Cmd+V yet inserts nothing — the transcript must go
        /// to the card, not into a fake-consumed paste.
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
        use crate::clipboard::PasteConfidence;
        use crate::macos_accessibility::CaretSight;

        #[test]
        fn an_affirmed_caret_vouches_by_itself() {
            for frontmost in [Some("com.unknown.app"), None] {
                assert_eq!(
                    placement_confidence(CaretSight::Affirmed, frontmost),
                    PasteConfidence::AffirmedCaret
                );
            }
        }

        /// Terminals and Zed hide their caret from accessibility yet insert every paste — their
        /// pasteboard read is a real receipt.
        #[test]
        fn a_blind_probe_in_a_terminal_class_app_trusts_the_read() {
            for app in ["com.mitchellh.ghostty", "dev.zed.Zed", "com.apple.Terminal"] {
                assert_eq!(
                    placement_confidence(CaretSight::Blind, Some(app)),
                    PasteConfidence::FluentApp
                );
            }
        }

        /// An unknown app can read the pasteboard on Cmd+V while inserting nothing — its read must
        /// not silence the card.
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
        assert_eq!(landing_for(Destination::Caret, false), Landing::Caret);
        assert_eq!(landing_for(Destination::Caret, true), Landing::Caret);
    }

    /// Chat asked for it, so the caret it would have displaced is none of its business.
    #[test]
    fn chat_dictation_lands_in_the_composer_that_started_it() {
        assert_eq!(landing_for(Destination::Chat, true), Landing::ChatComposer);
    }

    #[test]
    fn a_chat_closed_mid_dictation_leaves_the_transcript_in_hand() {
        assert_eq!(landing_for(Destination::Chat, false), Landing::Held);
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
}
