//! Where a finished dictation lands: the caret it was dictated into, the chat composer that asked for
//! it, or Echo's own hands when there is nowhere to put it.

use crate::caret::CaretSight;
use crate::model_pass::DictationTarget;
use crate::overlay;
use crate::settings::OverlayPosition;
use log::error;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    LazyLock, Mutex, MutexGuard, PoisonError,
};
use tauri::AppHandle;

mod permission;
mod spoken_caret;

use spoken_caret::SpokenCaretSight;

/// The binding a dictation starts from is what decides where its transcript goes.
pub(crate) const CHAT_BINDING_ID: &str = "chat_dictation";

static ROUTES_TO_CHAT: AtomicBool = AtomicBool::new(false);
static HELD_TRANSCRIPT: Mutex<Option<HeldTranscript>> = Mutex::new(None);
static SPOKEN_CARET_SIGHT: LazyLock<SpokenCaretSight> = LazyLock::new(SpokenCaretSight::new);

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
    /// The system would drop the paste, so the text is kept and the user told what to allow.
    Unpermitted,
}

/// Caret prediction proved unreliable, so only a chat transcript that lost its composer is held out.
pub(crate) fn landing_for(
    destination: Destination,
    chat_is_open: bool,
    can_paste: bool,
) -> Landing {
    match destination {
        Destination::Chat if chat_is_open => Landing::ChatComposer,
        Destination::Chat => Landing::Held,
        Destination::Caret if can_paste => Landing::Caret,
        Destination::Caret => Landing::Unpermitted,
    }
}

pub(crate) fn begin(binding_id: &str) {
    ROUTES_TO_CHAT.store(binding_id == CHAT_BINDING_ID, Ordering::Release);
    SPOKEN_CARET_SIGHT.probe(|| {
        crate::caret::coax_frontmost_into_answering();
        crate::caret::sight_focused_caret()
    });
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

/// The delivery-time focus may be Echo's own surface, so the dictation-start probe counts too.
fn combined_caret_sight() -> CaretSight {
    SPOKEN_CARET_SIGHT
        .sight()
        .max(crate::caret::sight_focused_caret())
}

/// These read the pasteboard on Cmd+V without inserting text, faking the paste receipt.
#[cfg(target_os = "macos")]
const PASTE_DEAF_APPS: &[&str] = &["com.apple.finder", "com.apple.dock"];
#[cfg(not(target_os = "macos"))]
const PASTE_DEAF_APPS: &[&str] = &[];

/// AX-blind but insert every paste, so their pasteboard read is a real receipt on macOS.
#[cfg(target_os = "macos")]
const PASTE_FLUENT_APPS: &[&str] = &[
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
#[cfg(not(target_os = "macos"))]
const PASTE_FLUENT_APPS: &[&str] = &[];

/// macOS apps fetch the untyped promise without pasting it; elsewhere only a text paste asks for text.
#[cfg(target_os = "macos")]
const BLIND_FETCH: crate::clipboard::PasteConfidence = crate::clipboard::PasteConfidence::Unvouched;
#[cfg(not(target_os = "macos"))]
const BLIND_FETCH: crate::clipboard::PasteConfidence = crate::clipboard::PasteConfidence::FluentApp;

fn placement_confidence(
    sight: CaretSight,
    frontmost: Option<&str>,
) -> crate::clipboard::PasteConfidence {
    use crate::clipboard::PasteConfidence;
    match sight {
        CaretSight::Affirmed => PasteConfidence::AffirmedCaret,
        CaretSight::Blind if frontmost.is_some_and(|app| PASTE_FLUENT_APPS.contains(&app)) => {
            PasteConfidence::FluentApp
        }
        CaretSight::Blind => BLIND_FETCH,
        CaretSight::DeniedByRole => PasteConfidence::Unvouched,
    }
}

fn frontmost_is_paste_deaf(
    frontmost: Option<&str>,
    echo_identifier: &str,
    caret_was_affirmed: bool,
) -> bool {
    if caret_was_affirmed {
        return false;
    }
    frontmost.is_some_and(|app| PASTE_DEAF_APPS.contains(&app) || app == echo_identifier)
}

/// Bundle id where there is one, process name otherwise.
fn frontmost_identity() -> Option<String> {
    use crate::managers::app_context::{FocusedAppProvider, PlatformFocusedAppProvider};
    let app = PlatformFocusedAppProvider.current()?;
    app.bundle_id.or(app.process_name)
}

/// The verdict that raises the held card at once also marks speech no text field can take.
pub(crate) fn target(app_handle: &AppHandle) -> DictationTarget {
    if routes_to_chat() {
        return DictationTarget::Chat;
    }
    let sight = combined_caret_sight();
    let frontmost = frontmost_identity();
    let refuses_text = sight == CaretSight::DeniedByRole
        || frontmost_is_paste_deaf(
            frontmost.as_deref(),
            &tauri::Manager::config(app_handle).identifier,
            sight == CaretSight::Affirmed,
        );
    log::info!("target: caret sight {sight:?}, frontmost {frontmost:?}");
    if refuses_text {
        DictationTarget::NoTextField
    } else {
        DictationTarget::TextField
    }
}

/// Only a confirmed miss hops back to the main thread to raise the held-out card.
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

/// Where a transcript goes, or `None` when there is nothing in it to deliver.
pub(crate) fn landing(app_handle: &AppHandle, text: &str) -> Option<Landing> {
    if text.trim().is_empty() {
        return None;
    }
    let destination = if routes_to_chat() {
        Destination::Chat
    } else {
        Destination::Caret
    };
    let can_paste = permission::paste_will_land(
        crate::settings::get_settings(app_handle).paste_method,
        crate::keystroke::is_permitted(),
    );
    Some(landing_for(
        destination,
        overlay::chat_surface_is_open(),
        can_paste,
    ))
}

/// The single exit of every dictation — both the direct and the post-processed one end here.
pub(crate) fn deliver(app_handle: &AppHandle, landing: Option<Landing>, text: String) {
    match landing {
        None => abandon(app_handle),
        Some(Landing::Caret) => paste_at_caret(app_handle, text),
        Some(Landing::ChatComposer) => {
            hold(text);
            overlay::hand_transcript_to_chat(app_handle);
        }
        Some(Landing::Held) => hold_out(app_handle, text),
        Some(Landing::Unpermitted) => permission::keep_without_pasting(app_handle, &text),
    }
}

/// Text-deaf focus still gets the paste but the card shows at once, since such apps fake the receipt.
fn paste_at_caret(app_handle: &AppHandle, text: String) {
    let sight = combined_caret_sight();
    let frontmost = frontmost_identity();
    log::info!("deliver: caret sight {sight:?}, frontmost {frontmost:?}");
    if frontmost_is_paste_deaf(
        frontmost.as_deref(),
        &tauri::Manager::config(app_handle).identifier,
        sight == CaretSight::Affirmed,
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

/// A denied caret puts the card up before the paste even goes out, so the settlement stays quiet.
fn no_offer_the_card_is_already_up() -> Box<dyn FnOnce(String) + Send + 'static> {
    Box::new(|_| {})
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
mod tests;
