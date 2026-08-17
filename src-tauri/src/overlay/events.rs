use super::generation::{OverlayGeneration, OverlayGenerationToken};
#[cfg(target_os = "linux")]
use super::layout::update_wayland_anchors;
#[cfg(target_os = "linux")]
use super::layout::OverlayPlacement;
use super::window::OVERLAY_NOTIFICATION_LABEL;
use super::window_modes::update_overlay_position;
use crate::features::polish::manager::{ChatContextCapture, ChatTextContext};
use crate::settings::{self, OverlayPosition};
use log::{debug, info, warn};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

static OVERLAY_GENERATION: OverlayGeneration = OverlayGeneration::new();
static NOTIFICATION_REQUEST_GENERATION: AtomicU64 = AtomicU64::new(0);
static CHAT_CONTEXT_GENERATION: AtomicU64 = AtomicU64::new(0);
static NOTIFICATION_REQUEST: Mutex<Option<NotificationRequestEvent>> = Mutex::new(None);
static CHAT_CONTEXT: Mutex<Option<ChatContextEvent>> = Mutex::new(None);

const OVERLAY_NOTIFICATION_REQUEST_EVENT: &str = "overlay-notification-request";
const OVERLAY_CHAT_CONTEXT_EVENT: &str = "overlay-chat-context";

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

pub(super) fn begin_chat_context_refresh(
    app_handle: &AppHandle,
    generation: u64,
) -> Result<(), String> {
    CHAT_CONTEXT_GENERATION.store(generation, Ordering::Release);
    let has_current = match CHAT_CONTEXT.lock() {
        Ok(mut current) => current.as_mut().is_some_and(|event| {
            event.generation = generation;
            true
        }),
        Err(poisoned) => poisoned.into_inner().as_mut().is_some_and(|event| {
            event.generation = generation;
            true
        }),
    };
    if has_current {
        return Ok(());
    }
    emit_chat_context_loading(app_handle, generation).map(|_| ())
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
        ChatContextCapture::Unavailable => return Ok(None),
    };
    emit_chat_context_event(app_handle, event).map(Some)
}

struct OverlayPresentation<'a> {
    state: &'a str,
    message: &'a str,
    duration: Option<std::time::Duration>,
}

struct PendingOverlayPresentation {
    duration: Option<std::time::Duration>,
    generation: OverlayGenerationToken,
    message: String,
    state: String,
}

type MainThreadMutation = Box<dyn FnOnce() + Send + 'static>;

/// run_on_main_thread required for Wayland GTK/layer-shell.
pub(crate) fn show_recording_overlay(app_handle: &AppHandle) {
    let generation = OVERLAY_GENERATION.begin();
    let app_handle = app_handle.clone();
    let app_handle_inner = app_handle.clone();

    let result = app_handle.run_on_main_thread(move || {
        if !OVERLAY_GENERATION.is_current(generation) {
            return;
        }
        let closure_start = std::time::Instant::now();
        let app_handle = app_handle_inner;
        let settings = settings::get_settings(&app_handle);
        if settings.overlay_position == OverlayPosition::None {
            return;
        }

        update_overlay_position(&app_handle);
        info!(
            "[Overlay] main-thread show closure: position computed in {:?}",
            closure_start.elapsed()
        );

        if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
            debug!("[Overlay] Showing recording overlay");
            #[cfg(target_os = "linux")]
            update_wayland_anchors(&overlay_window, OverlayPlacement::from_settings(&settings));

            let _ = overlay_window.emit("show-overlay", "recording");
        }
    });
    if let Err(error) = result {
        warn!("[Overlay] Failed to schedule recording overlay: {error}");
    }
}

pub(crate) fn show_transcribing_overlay(app_handle: &AppHandle) {
    let generation = OVERLAY_GENERATION.begin();
    let app_handle = app_handle.clone();
    let app_handle_inner = app_handle.clone();

    let result = app_handle.run_on_main_thread(move || {
        if !OVERLAY_GENERATION.is_current(generation) {
            return;
        }
        let app_handle = app_handle_inner;
        let settings = settings::get_settings(&app_handle);
        if settings.overlay_position == OverlayPosition::None {
            return;
        }

        update_overlay_position(&app_handle);

        if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
            #[cfg(target_os = "linux")]
            if crate::wayland::is_wayland() {
                crate::wayland::present_gnome_overlay(&overlay_window);
            }
            let _ = overlay_window.emit("show-overlay", "transcribing");
        }
    });
    if let Err(error) = result {
        warn!("[Overlay] Failed to schedule transcribing overlay: {error}");
    }
}

/// Auto-hides after 2s.
pub(crate) fn show_warning_overlay(app_handle: &AppHandle, message: &str) {
    show_overlay_presentation(
        app_handle,
        OverlayPresentation {
            state: "warning",
            message,
            duration: Some(std::time::Duration::from_secs(2)),
        },
    );
}

/// Auto-hides after 3s — longer than a warning, for readability.
pub(crate) fn show_tool_overlay(app_handle: &AppHandle, message: &str) {
    show_overlay_presentation(
        app_handle,
        OverlayPresentation {
            state: "tool",
            message,
            duration: Some(std::time::Duration::from_secs(3)),
        },
    );
}

pub(crate) fn show_processing_overlay(app_handle: &AppHandle, message: &str) {
    show_overlay_presentation(
        app_handle,
        OverlayPresentation {
            state: "processing",
            message,
            duration: None,
        },
    );
}

fn show_overlay_presentation(app_handle: &AppHandle, presentation: OverlayPresentation<'_>) {
    let pending = PendingOverlayPresentation {
        duration: presentation.duration,
        generation: OVERLAY_GENERATION.begin(),
        message: presentation.message.to_string(),
        state: presentation.state.to_string(),
    };
    let dispatch_handle = app_handle.clone();
    let mutation_handle = app_handle.clone();
    let result = dispatch_main_thread_mutation(
        move |mutation| {
            dispatch_handle
                .run_on_main_thread(mutation)
                .map_err(|error| error.to_string())
        },
        move || render_overlay_presentation(&mutation_handle, pending),
    );
    if let Err(error) = result {
        warn!("[Overlay] Failed to schedule temporary overlay: {error}");
    }
}

fn dispatch_main_thread_mutation(
    dispatch: impl FnOnce(MainThreadMutation) -> Result<(), String>,
    mutation: impl FnOnce() + Send + 'static,
) -> Result<(), String> {
    dispatch(Box::new(mutation))
}

fn render_overlay_presentation(app_handle: &AppHandle, pending: PendingOverlayPresentation) {
    if !OVERLAY_GENERATION.is_current(pending.generation) {
        return;
    }
    let settings = settings::get_settings(app_handle);
    if settings.overlay_position == OverlayPosition::None {
        return;
    }

    update_overlay_position(app_handle);

    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        #[cfg(target_os = "linux")]
        if crate::wayland::is_wayland() {
            crate::wayland::present_gnome_overlay(&overlay_window);
        }
        let _ = overlay_window.emit(
            "show-overlay",
            serde_json::json!({
                "state": pending.state,
                "message": pending.message
            }),
        );

        if let Some(duration) = pending.duration {
            let window_clone = overlay_window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(duration);
                if OVERLAY_GENERATION.is_current(pending.generation) {
                    let _ = window_clone.emit("hide-overlay", ());
                }
            });
        }
    }
}

/// Always hides regardless of settings — handles mid-recording setting change.
pub(crate) fn hide_recording_overlay(app_handle: &AppHandle) {
    OVERLAY_GENERATION.begin();
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.emit("hide-overlay", ());
    }
}

fn dispatch_overlay_event<T: ?Sized>(event: &str, payload: &T, emit: impl FnOnce(&str, &T)) {
    emit(event, payload);
}

pub(crate) fn emit_levels(app_handle: &AppHandle, levels: &[f32]) {
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        dispatch_overlay_event("mic-level", levels, |event, payload| {
            let _ = overlay_window.emit(event, payload);
        });
    }
}

pub(crate) fn emit_transcription_progress(app_handle: &AppHandle, text: &str) {
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        dispatch_overlay_event("transcription-progress", text, |event, payload| {
            let _ = overlay_window.emit(event, payload);
        });
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    #[test]
    fn only_the_two_hud_triggered_surfaces_can_be_requested() {
        assert_eq!(super::parse_notification_request("chat"), Ok("chat"));
        assert_eq!(super::parse_notification_request("panel"), Ok("panel"));
        assert_eq!(
            super::parse_notification_request("recording"),
            Err("Unknown overlay notification surface: recording".to_string())
        );
    }

    #[test]
    fn overlay_event_dispatch_targets_the_hud_once() {
        let count = Cell::new(0);

        super::dispatch_overlay_event("mic-level", &[0.25_f32], |event, payload| {
            assert_eq!(event, "mic-level");
            assert_eq!(payload, &[0.25_f32]);
            count.set(count.get() + 1);
        });

        assert_eq!(count.get(), 1);
    }

    #[test]
    fn temporary_overlay_mutation_runs_inside_main_thread_dispatch() {
        let entered_dispatch = Arc::new(AtomicBool::new(false));
        let mutation_ran_on_dispatch = Arc::new(AtomicBool::new(false));
        let dispatch_flag = Arc::clone(&entered_dispatch);
        let mutation_dispatch_flag = Arc::clone(&entered_dispatch);
        let mutation_result = Arc::clone(&mutation_ran_on_dispatch);

        let result = super::dispatch_main_thread_mutation(
            move |mutation| {
                dispatch_flag.store(true, Ordering::Release);
                mutation();
                Ok(())
            },
            move || {
                mutation_result.store(
                    mutation_dispatch_flag.load(Ordering::Acquire),
                    Ordering::Release,
                );
            },
        );

        assert!(result.is_ok());
        assert!(mutation_ran_on_dispatch.load(Ordering::Acquire));
    }
}
