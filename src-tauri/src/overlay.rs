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

use tauri::AppHandle;

pub(crate) use events::{
    emit_levels, emit_transcription_progress, hide_recording_overlay, show_processing_overlay,
    show_recording_overlay, show_tool_overlay, show_transcribing_overlay, show_warning_overlay,
};
pub(crate) use window_modes::update_overlay_position;
pub(crate) use window_setup::create_recording_overlay;

pub(crate) fn release_recording_overlay_focus(app_handle: &AppHandle) -> Result<(), String> {
    window::release_recording_overlay_focus(app_handle)
}

/// Keeps synthetic paste keystrokes off the HUD and on the target app.
#[cfg(target_os = "macos")]
pub(crate) struct OverlayPasteKeyGuard;

#[cfg(target_os = "macos")]
impl OverlayPasteKeyGuard {
    pub(crate) fn acquire(app_handle: &AppHandle) -> Self {
        macos_panel::begin_paste_key_suppression(app_handle);
        Self
    }
}

#[cfg(target_os = "macos")]
impl Drop for OverlayPasteKeyGuard {
    fn drop(&mut self) {
        macos_panel::end_paste_key_suppression();
    }
}

#[tauri::command]
pub(crate) fn get_recording_overlay_surface(
    app_handle: AppHandle,
) -> Option<surface::OverlaySurfacePayload> {
    window_modes::hud_surface_payload(&app_handle)
}

#[tauri::command]
pub(crate) fn get_overlay_notification_surface(
    app_handle: AppHandle,
) -> Option<surface::OverlaySurfacePayload> {
    window_modes::notification_surface_payload(&app_handle)
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
pub(crate) fn hide_overlay_notification(app_handle: AppHandle) -> Result<(), String> {
    window_modes::hide_notification(&app_handle)
}

/// Chat and the model panel live in the notification window — the request crosses through Rust.
#[tauri::command]
pub(crate) fn request_overlay_notification(
    app_handle: AppHandle,
    surface: String,
) -> Result<(), String> {
    events::request_overlay_notification(&app_handle, &surface)
}

/// The HUD handle is a few pixels tall — failures surface as a warning notification instead.
#[tauri::command]
pub(crate) fn warn_from_overlay(app_handle: AppHandle, message: String) {
    events::show_warning_overlay(&app_handle, &message);
}
