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

/// A transcript is never dropped: whatever cannot reach its destination is held out to the user instead.
pub(crate) fn landing_for(
    destination: Destination,
    chat_is_open: bool,
    caret_is_reachable: bool,
) -> Landing {
    match destination {
        Destination::Chat if chat_is_open => Landing::ChatComposer,
        Destination::Caret if caret_is_reachable => Landing::Caret,
        _ => Landing::Held,
    }
}

pub(crate) fn begin(binding_id: &str) {
    ROUTES_TO_CHAT.store(binding_id == CHAT_BINDING_ID, Ordering::Release);
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

#[cfg(target_os = "macos")]
fn caret_is_reachable(app_handle: &AppHandle) -> bool {
    !crate::clipboard::paste_needs_a_caret(app_handle)
        || crate::macos_accessibility::caret_is_reachable()
}

#[cfg(not(target_os = "macos"))]
fn caret_is_reachable(_app_handle: &AppHandle) -> bool {
    true
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
    match landing_for(
        destination,
        overlay::chat_surface_is_open(),
        caret_is_reachable(app_handle),
    ) {
        Landing::Caret => {
            if let Err(error) = crate::clipboard::paste(&text, app_handle) {
                error!("Failed to paste transcription: {error}");
                hold_out(app_handle, text);
            }
        }
        Landing::ChatComposer => {
            hold(text);
            overlay::hand_transcript_to_chat(app_handle);
        }
        Landing::Held => hold_out(app_handle, text),
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

    #[test]
    fn a_dictation_reaches_the_caret_it_was_spoken_into() {
        assert_eq!(landing_for(Destination::Caret, false, true), Landing::Caret);
    }

    #[test]
    fn a_transcript_with_no_caret_is_held_out_instead_of_dropped() {
        assert_eq!(landing_for(Destination::Caret, false, false), Landing::Held);
    }

    /// Chat asked for it, so the caret it would have displaced is none of its business.
    #[test]
    fn chat_dictation_lands_in_the_composer_that_started_it() {
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
}
