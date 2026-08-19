mod drag_preview;
mod events;
mod generation;
mod layout;
#[cfg(target_os = "macos")]
mod macos_hover;
#[cfg(target_os = "macos")]
mod macos_hover_sync;
#[cfg(target_os = "macos")]
mod macos_panel;
mod monitor;
#[cfg(target_os = "macos")]
mod screen_follow;
mod snap;
mod surface;
mod window;
mod window_modes;
mod window_setup;

use crate::features::polish::chat_context::{ChatContextCapture, ShownChatContext};
use crate::features::polish::manager::PolishManager;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub(crate) use events::{
    emit_levels, emit_transcription_progress, hide_recording_overlay, show_processing_overlay,
    show_recording_overlay, show_tool_overlay, show_transcribing_overlay, show_warning_overlay,
};
pub(crate) use window_modes::update_overlay_position;
pub(crate) use window_setup::create_recording_overlay;

const TRANSCRIPT_SURFACE: &str = "transcript";
const CHAT_SURFACE: &str = "chat";

pub(crate) fn release_recording_overlay_focus(app_handle: &AppHandle) -> Result<(), String> {
    window::release_recording_overlay_focus(app_handle)
}

/// A transcript with nowhere to land is held out to the user instead of vanishing.
pub(crate) fn show_held_transcript(app_handle: &AppHandle) -> Result<(), String> {
    let request = events::record_notification_request(TRANSCRIPT_SURFACE);
    show_notification_surface(app_handle, request, TRANSCRIPT_SURFACE)
}

pub(crate) fn chat_surface_is_open() -> bool {
    events::requested_surface() == Some(CHAT_SURFACE)
}

pub(crate) fn hand_transcript_to_chat(app_handle: &AppHandle) {
    events::emit_chat_dictation(app_handle);
}

fn show_notification_surface(
    app_handle: &AppHandle,
    request: events::NotificationRequestEvent,
    surface: &str,
) -> Result<(), String> {
    if let Err(error) = window_modes::set_notification_mode(app_handle, surface) {
        events::clear_notification_request();
        return Err(error);
    }
    if let Err(error) = events::emit_notification_request(app_handle, request) {
        events::clear_notification_request();
        let _ = window_modes::hide_notification(app_handle);
        return Err(error);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) struct OverlaySyntheticKeyGuard;

#[cfg(target_os = "macos")]
impl OverlaySyntheticKeyGuard {
    pub(crate) fn acquire(app_handle: &AppHandle) -> Self {
        macos_panel::begin_synthetic_key_suppression(app_handle);
        Self
    }
}

#[cfg(target_os = "macos")]
impl Drop for OverlaySyntheticKeyGuard {
    fn drop(&mut self) {
        macos_panel::end_synthetic_key_suppression();
    }
}
const CHAT_CONTEXT_WATCH_INTERVAL: Duration = Duration::from_millis(350);

fn log_chat_context_capture(capture: &ChatContextCapture) {
    match capture {
        ChatContextCapture::PermissionRequired => {
            log::warn!("Chat cannot read selected text without Accessibility access");
        }
        ChatContextCapture::Ready(Some(context)) => {
            log::info!("Chat attached {} selected characters", context.text.len());
        }
        ChatContextCapture::Ready(None) => {
            log::info!("Chat found no selected text");
        }
    }
}

/// Follows the selection while the user's app owns the keyboard; while chat owns it, nothing can change.
async fn watch_chat_context(
    app_handle: AppHandle,
    manager: Arc<PolishManager>,
    request: events::NotificationRequestEvent,
    mut shown: ShownChatContext,
) {
    let mut interval = tokio::time::interval(CHAT_CONTEXT_WATCH_INTERVAL);
    interval.tick().await;
    loop {
        interval.tick().await;
        if !events::notification_request_is_current(request) {
            return;
        }
        let observed = match manager.observe_selected_text() {
            Ok(observed) => observed,
            Err(error) => {
                log::debug!("Could not refresh selected Chat text: {error:#}");
                continue;
            }
        };
        if !shown.absorb(observed) {
            continue;
        }
        log_chat_context_capture(&shown.capture);
        let generation = events::current_chat_context_generation();
        if let Err(error) =
            events::emit_chat_context_capture(&app_handle, generation, &shown.capture)
        {
            log::warn!("{error}");
        }
    }
}

#[tauri::command]
pub(crate) fn get_recording_overlay_surface() -> Option<surface::OverlaySurfacePayload> {
    window_modes::hud_surface_payload()
}

#[tauri::command]
pub(crate) fn get_overlay_notification_surface() -> Option<surface::OverlaySurfacePayload> {
    window_modes::notification_surface_payload()
}

#[tauri::command]
pub(crate) fn begin_recording_overlay_snap_preview(app_handle: AppHandle) -> Result<(), String> {
    snap::begin_snap_preview(&app_handle)
}

#[tauri::command]
pub(crate) fn cancel_recording_overlay_snap_preview(app_handle: AppHandle) -> Result<(), String> {
    snap::cancel_drag(&app_handle)
}

#[tauri::command]
pub(crate) fn set_recording_overlay_dock_edge(
    app_handle: AppHandle,
    edge: String,
) -> Result<(), String> {
    snap::set_dock_edge(&app_handle, &edge)
}

#[tauri::command]
pub(crate) fn snap_recording_overlay_to_nearest_edge(app_handle: AppHandle) -> Result<(), String> {
    snap::finish_drag(&app_handle)
}

/// A teleport — the webview fades the island out before asking for the move.
#[tauri::command]
pub(crate) fn move_recording_overlay_to_cursor_screen(app_handle: AppHandle) {
    window_modes::update_overlay_position(&app_handle);
}

#[tauri::command]
pub(crate) fn set_recording_overlay_mode(
    app_handle: AppHandle,
    mode: String,
) -> Result<(), String> {
    window_modes::set_hud_mode(&app_handle, &mode)
}

#[tauri::command]
pub(crate) fn settle_recording_overlay_mode(
    app_handle: AppHandle,
    mode: String,
) -> Result<(), String> {
    window_modes::settle_hud_mode(&app_handle, &mode)
}

#[tauri::command]
pub(crate) fn set_overlay_notification_mode(
    app_handle: AppHandle,
    mode: String,
) -> Result<(), String> {
    window_modes::set_notification_mode(&app_handle, &mode)
}

#[tauri::command]
pub(crate) fn settle_overlay_notification_mode(
    app_handle: AppHandle,
    mode: String,
) -> Result<(), String> {
    window_modes::settle_notification_mode(&app_handle, &mode)
}

#[tauri::command]
pub(crate) fn get_overlay_notification_request() -> Option<events::NotificationRequestEvent> {
    events::current_notification_request()
}

#[tauri::command]
pub(crate) fn get_overlay_chat_context() -> Option<events::ChatContextEvent> {
    events::current_chat_context_event()
}

#[tauri::command]
pub(crate) fn hide_overlay_notification(app_handle: AppHandle) -> Result<(), String> {
    if events::requested_surface() == Some(TRANSCRIPT_SURFACE) {
        crate::dictation::drop_held_transcript();
    }
    events::clear_notification_request();
    window_modes::hide_notification(&app_handle)
}

/// The held transcript goes to chat as a finished question, not as a draft to keep typing.
#[tauri::command]
pub(crate) async fn send_held_transcript_to_chat(
    app_handle: AppHandle,
    manager: State<'_, Arc<PolishManager>>,
) -> Result<(), String> {
    crate::dictation::hand_over_as_question();
    request_overlay_notification(app_handle, manager, CHAT_SURFACE.to_string()).await
}

/// Chat and the model panel live in the notification window — the request crosses through Rust.
#[tauri::command]
pub(crate) async fn request_overlay_notification(
    app_handle: AppHandle,
    manager: State<'_, Arc<PolishManager>>,
    surface: String,
) -> Result<(), String> {
    let requested = events::parse_notification_request(&surface)?;
    let request = events::record_notification_request(requested);
    let chat_capture = if requested == "chat" {
        let generation = manager.begin_chat_context_capture();
        if let Err(error) = events::emit_chat_context_loading(&app_handle, generation) {
            events::clear_notification_request();
            return Err(error);
        }
        #[cfg(target_os = "macos")]
        let selection_key_guard = OverlaySyntheticKeyGuard::acquire(&app_handle);
        let context_manager = Arc::clone(manager.inner());
        let shown = match context_manager.capture_chat_context(generation).await {
            Ok(shown) => shown,
            Err(error) => {
                log::warn!("Could not capture text for chat: {error:#}");
                ShownChatContext::read_by_copy(ChatContextCapture::Ready(None))
            }
        };
        #[cfg(target_os = "macos")]
        drop(selection_key_guard);
        if !events::notification_request_is_current(request) {
            return Ok(());
        }
        Some((generation, context_manager, shown))
    } else {
        None
    };
    show_notification_surface(&app_handle, request, requested)?;
    let Some((generation, context_manager, shown)) = chat_capture else {
        return Ok(());
    };
    log_chat_context_capture(&shown.capture);
    events::emit_chat_context_capture(&app_handle, generation, &shown.capture)?;
    let watch_manager = Arc::clone(&context_manager);
    let watch_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        watch_chat_context(watch_handle, watch_manager, request, shown).await;
    });
    if manager.is_downloaded() {
        tauri::async_runtime::spawn(async move {
            if let Err(error) = context_manager.prepare().await {
                log::warn!("Chat model preparation unavailable: {error:#}");
            }
        });
    }
    Ok(())
}
#[tauri::command]
pub(crate) fn open_chat_model_settings(app_handle: AppHandle) -> Result<(), String> {
    crate::startup::show_main_window(&app_handle);
    app_handle
        .emit_to("main", "open-settings-section", "post-processing")
        .map_err(|error| format!("Failed to open chat model settings: {error}"))
}

/// The HUD handle is a few pixels tall — failures surface as a warning notification instead.
#[tauri::command]
pub(crate) fn warn_from_overlay(app_handle: AppHandle, message: String) {
    events::show_warning_overlay(&app_handle, &message);
}
