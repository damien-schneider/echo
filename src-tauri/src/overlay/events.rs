use super::window::OVERLAY_NOTIFICATION_LABEL;
use crate::features::polish::chat_context::{ChatContextCapture, ChatTextContext};
use log::warn;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static NOTIFICATION_REQUEST_GENERATION: AtomicU64 = AtomicU64::new(0);
static CHAT_CONTEXT_GENERATION: AtomicU64 = AtomicU64::new(0);
static NOTIFICATION_REQUEST: Mutex<Option<NotificationRequestEvent>> = Mutex::new(None);
static CHAT_CONTEXT: Mutex<Option<ChatContextEvent>> = Mutex::new(None);

const OVERLAY_NOTIFICATION_REQUEST_EVENT: &str = "overlay-notification-request";
const OVERLAY_CHAT_CONTEXT_EVENT: &str = "overlay-chat-context";
const OVERLAY_CHAT_DICTATION_EVENT: &str = "overlay-chat-dictation";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NotificationRequestEvent {
    generation: u64,
    surface: &'static str,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ChatContextState {
    Loading,
    PermissionRequired,
    Ready,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatContextEvent {
    context: Option<ChatTextContext>,
    generation: u64,
    state: ChatContextState,
}

pub(super) fn parse_notification_request(surface: &str) -> Result<&'static str, String> {
    match surface {
        "chat" => Ok("chat"),
        "panel" => Ok("panel"),
        _ => Err(format!("Unknown overlay notification surface: {surface}")),
    }
}

pub(super) fn record_notification_request(surface: &'static str) -> NotificationRequestEvent {
    let request = NotificationRequestEvent {
        generation: NOTIFICATION_REQUEST_GENERATION
            .fetch_add(1, Ordering::AcqRel)
            .wrapping_add(1),
        surface,
    };
    clear_chat_context_event();
    match NOTIFICATION_REQUEST.lock() {
        Ok(mut current) => *current = Some(request),
        Err(poisoned) => *poisoned.into_inner() = Some(request),
    }
    request
}

pub(super) fn emit_notification_request(
    app_handle: &AppHandle,
    request: NotificationRequestEvent,
) -> Result<(), String> {
    app_handle
        .emit_to(
            OVERLAY_NOTIFICATION_LABEL,
            OVERLAY_NOTIFICATION_REQUEST_EVENT,
            request,
        )
        .map_err(|error| format!("Failed to request the overlay notification: {error}"))
}

pub(super) fn current_notification_request() -> Option<NotificationRequestEvent> {
    match NOTIFICATION_REQUEST.lock() {
        Ok(current) => *current,
        Err(poisoned) => **poisoned.get_ref(),
    }
}
pub(super) fn requested_surface() -> Option<&'static str> {
    current_notification_request().map(|request| request.surface)
}

/// The composer pulls the text itself — the event only tells it there is some.
pub(super) fn emit_chat_dictation(app_handle: &AppHandle) {
    if let Err(error) =
        app_handle.emit_to(OVERLAY_NOTIFICATION_LABEL, OVERLAY_CHAT_DICTATION_EVENT, ())
    {
        warn!("Failed to hand the dictated text to chat: {error}");
    }
}

pub(super) fn notification_request_is_current(request: NotificationRequestEvent) -> bool {
    current_notification_request() == Some(request)
}

pub(super) fn clear_notification_request() {
    match NOTIFICATION_REQUEST.lock() {
        Ok(mut current) => *current = None,
        Err(poisoned) => *poisoned.into_inner() = None,
    }
    clear_chat_context_event();
}

pub(super) struct Dismissed {
    pub(super) surface: Option<&'static str>,
}

/// A hide sent before the window heard of the newest request must leave that request standing.
fn hide_is_late(recorded: Option<NotificationRequestEvent>, last_seen: u64) -> bool {
    recorded.is_some_and(|request| request.generation > last_seen)
}

/// `None` when the hide is late and dismisses nothing.
pub(super) fn dismiss_notification_request(last_seen: u64) -> Option<Dismissed> {
    let mut current = match NOTIFICATION_REQUEST.lock() {
        Ok(current) => current,
        Err(poisoned) => poisoned.into_inner(),
    };
    if hide_is_late(*current, last_seen) {
        return None;
    }
    let surface = current.take().map(|request| request.surface);
    drop(current);
    clear_chat_context_event();
    Some(Dismissed { surface })
}

fn emit_chat_context_event(
    app_handle: &AppHandle,
    event: ChatContextEvent,
) -> Result<ChatContextEvent, String> {
    match CHAT_CONTEXT.lock() {
        Ok(mut current) => *current = Some(event.clone()),
        Err(poisoned) => *poisoned.into_inner() = Some(event.clone()),
    }
    app_handle
        .emit_to(
            OVERLAY_NOTIFICATION_LABEL,
            OVERLAY_CHAT_CONTEXT_EVENT,
            event.clone(),
        )
        .map_err(|error| format!("Failed to update the chat context: {error}"))?;
    Ok(event)
}

pub(super) fn current_chat_context_event() -> Option<ChatContextEvent> {
    match CHAT_CONTEXT.lock() {
        Ok(current) => current.clone(),
        Err(poisoned) => poisoned.into_inner().clone(),
    }
}

fn clear_chat_context_event() {
    match CHAT_CONTEXT.lock() {
        Ok(mut current) => *current = None,
        Err(poisoned) => *poisoned.into_inner() = None,
    }
}

pub(super) fn emit_chat_context_loading(
    app_handle: &AppHandle,
    generation: u64,
) -> Result<ChatContextEvent, String> {
    CHAT_CONTEXT_GENERATION.store(generation, Ordering::Release);
    emit_chat_context_event(
        app_handle,
        ChatContextEvent {
            context: None,
            generation,
            state: ChatContextState::Loading,
        },
    )
}

pub(super) fn current_chat_context_generation() -> u64 {
    CHAT_CONTEXT_GENERATION.load(Ordering::Acquire)
}

pub(super) fn emit_chat_context_capture(
    app_handle: &AppHandle,
    generation: u64,
    capture: &ChatContextCapture,
) -> Result<Option<ChatContextEvent>, String> {
    if generation != current_chat_context_generation() {
        return Ok(None);
    }
    let is_current = match CHAT_CONTEXT.lock() {
        Ok(current) => current
            .as_ref()
            .is_some_and(|event| event.generation == generation),
        Err(poisoned) => poisoned
            .into_inner()
            .as_ref()
            .is_some_and(|event| event.generation == generation),
    };
    if !is_current {
        return Ok(None);
    }
    let event = match capture {
        ChatContextCapture::PermissionRequired => ChatContextEvent {
            context: None,
            generation,
            state: ChatContextState::PermissionRequired,
        },
        ChatContextCapture::Ready(context) => ChatContextEvent {
            context: context.clone(),
            generation,
            state: ChatContextState::Ready,
        },
    };
    emit_chat_context_event(app_handle, event).map(Some)
}

#[cfg(test)]
mod tests {
    use super::{hide_is_late, NotificationRequestEvent};

    fn chat_request(generation: u64) -> Option<NotificationRequestEvent> {
        Some(NotificationRequestEvent {
            generation,
            surface: "chat",
        })
    }

    #[test]
    fn only_the_two_hud_triggered_surfaces_can_be_requested() {
        assert_eq!(super::parse_notification_request("chat"), Ok("chat"));
        assert_eq!(super::parse_notification_request("panel"), Ok("panel"));
        assert_eq!(
            super::parse_notification_request("recording"),
            Err("Unknown overlay notification surface: recording".to_string())
        );
        assert_eq!(
            super::parse_notification_request("transcript"),
            Err("Unknown overlay notification surface: transcript".to_string())
        );
    }

    #[test]
    fn a_late_hide_leaves_a_newer_request_standing() {
        assert!(hide_is_late(chat_request(2), 1));
        assert!(hide_is_late(chat_request(1), 0));
    }

    #[test]
    fn a_hide_dismisses_the_request_the_window_was_showing() {
        assert!(!hide_is_late(chat_request(2), 2));
    }

    #[test]
    fn a_hide_with_nothing_requested_still_releases_the_window() {
        assert!(!hide_is_late(None, 0));
    }
}
