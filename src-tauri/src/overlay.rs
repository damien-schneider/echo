mod activity;
mod chat_context_follow;
pub(crate) mod context_menu;
mod drag_preview;
mod events;
mod generation;
mod glide;
mod layout;
mod live_dictation;
#[cfg(target_os = "macos")]
mod macos_hover;
#[cfg(target_os = "macos")]
mod macos_hover_sync;
#[cfg(target_os = "macos")]
mod macos_panel;
#[cfg(target_os = "macos")]
mod macos_selection_gesture;
mod monitor;
#[cfg(target_os = "macos")]
mod screen_follow;
mod snap;
mod surface;
mod window;
mod window_modes;
mod window_setup;
#[cfg(target_os = "windows")]
mod windows_topmost;

use crate::features::polish::chat_context::{ChatContextCapture, ShownChatContext};
use crate::features::polish::manager::PolishManager;
use chat_context_follow::{log_chat_context_capture, watch_chat_context};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub(crate) use activity::{
    emit_levels, emit_transcription_progress, hide_recording_overlay, mark_recording_live,
    show_model_required_overlay, show_preparing_overlay, show_processing_overlay,
    show_tool_overlay, show_transcribing_overlay, show_warning_overlay,
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
pub(crate) fn hide_overlay_notification(
    app_handle: AppHandle,
    last_seen_request: u64,
) -> Result<(), String> {
    let Some(dismissed) = events::dismiss_notification_request(last_seen_request) else {
        return Ok(());
    };
    if dismissed.surface == Some(TRANSCRIPT_SURFACE) {
        crate::dictation::drop_held_transcript();
    }
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

pub(crate) async fn open_chat(app_handle: AppHandle) -> Result<(), String> {
    let manager = app_handle.state::<Arc<PolishManager>>();
    request_overlay_notification(app_handle.clone(), manager, CHAT_SURFACE.to_string()).await
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
    if requested != CHAT_SURFACE {
        return show_notification_surface(&app_handle, request, requested);
    }
    let generation = manager.begin_selection_read();
    if let Err(error) = events::emit_chat_context_loading(&app_handle, generation) {
        events::clear_notification_request();
        return Err(error);
    }
    let context_manager = Arc::clone(manager.inner());
    prepare_chat_model(&context_manager);
    let Some(shown) =
        show_chat_around_capture(&app_handle, &context_manager, request, generation).await?
    else {
        return Ok(());
    };
    log_chat_context_capture(&shown.capture);
    events::emit_chat_context_capture(&app_handle, generation, &shown.capture)?;
    tauri::async_runtime::spawn(watch_chat_context(
        app_handle,
        context_manager,
        request,
        shown,
    ));
    Ok(())
}

fn prepare_chat_model(manager: &Arc<PolishManager>) {
    if !manager.is_downloaded() {
        return;
    }
    let manager = Arc::clone(manager);
    tauri::async_runtime::spawn(async move {
        if let Err(error) = manager.prepare().await {
            log::warn!("Chat model preparation unavailable: {error:#}");
        }
    });
}

async fn captured_chat_context(manager: &PolishManager, generation: u64) -> ShownChatContext {
    manager
        .capture_chat_context(generation)
        .await
        .unwrap_or_else(|error| {
            log::warn!("Could not capture text for chat: {error:#}");
            ShownChatContext::read_by_copy(ChatContextCapture::Ready(None))
        })
}

/// The chat shows at once; the keyboard waits until the copy shortcut has reached the user's app.
#[cfg(target_os = "macos")]
async fn show_chat_around_capture(
    app_handle: &AppHandle,
    manager: &PolishManager,
    request: events::NotificationRequestEvent,
    generation: u64,
) -> Result<Option<ShownChatContext>, String> {
    let key_guard = OverlaySyntheticKeyGuard::acquire(app_handle);
    show_notification_surface(app_handle, request, CHAT_SURFACE)?;
    let shown = captured_chat_context(manager, generation).await;
    drop(key_guard);
    if !events::notification_request_is_current(request) {
        return Ok(None);
    }
    if let Err(error) = macos_panel::take_key(app_handle, window::OVERLAY_NOTIFICATION_LABEL) {
        log::warn!("Chat could not take the keyboard: {error}");
    }
    Ok(Some(shown))
}

/// Showing focuses the window here, so the copy shortcut has to run first.
#[cfg(not(target_os = "macos"))]
async fn show_chat_around_capture(
    app_handle: &AppHandle,
    manager: &PolishManager,
    request: events::NotificationRequestEvent,
    generation: u64,
) -> Result<Option<ShownChatContext>, String> {
    let shown = captured_chat_context(manager, generation).await;
    if !events::notification_request_is_current(request) {
        return Ok(None);
    }
    show_notification_surface(app_handle, request, CHAT_SURFACE)?;
    Ok(Some(shown))
}

/// The HUD handle is a few pixels tall — failures surface as a warning notification instead.
#[tauri::command]
pub(crate) fn warn_from_overlay(app_handle: AppHandle, message: String) {
    activity::show_warning_overlay(&app_handle, &message);
}

/// A webview that mounts mid-dictation asks for the state it missed.
#[tauri::command]
pub(crate) fn get_overlay_activity(app_handle: AppHandle) -> Option<&'static str> {
    live_dictation::shown_phase(&app_handle)
}

#[tauri::command]
pub(crate) fn open_settings_from_overlay(app_handle: AppHandle) {
    crate::startup::show_settings(&app_handle);
}
