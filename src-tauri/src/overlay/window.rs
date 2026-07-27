#[cfg(not(target_os = "macos"))]
use super::layout::overlay_mode_accepts_keyboard;
use super::layout::{
    overlay_placement_for_mode, OverlayFrame, OverlayPlacement, OverlaySurfaceKind,
    RecordingOverlayMode,
};
#[cfg(target_os = "macos")]
use super::macos_panel;
use super::monitor::{overlay_screen, OverlayScreen};
use super::surface::{
    overlay_surface, overlay_surface_payload, surface_hover_box, transition_window,
    OverlayBoxPayload, OverlaySurface, OverlaySurfacePayload, SurfaceRequest,
};
use crate::settings;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

pub(super) const RECORDING_OVERLAY_LABEL: &str = "recording_overlay";
pub(super) const OVERLAY_NOTIFICATION_LABEL: &str = "overlay_notification";
const OVERLAY_SURFACE_EVENT: &str = "overlay-surface";
const OVERLAY_NOTIFICATION_SURFACE_EVENT: &str = "overlay-notification-surface";

pub(super) fn surface_window_label(kind: OverlaySurfaceKind) -> &'static str {
    match kind {
        OverlaySurfaceKind::Hud => RECORDING_OVERLAY_LABEL,
        OverlaySurfaceKind::Notification => OVERLAY_NOTIFICATION_LABEL,
    }
}

/// Per-window channel — a broadcast would redraw the HUD against the notification's frame.
fn surface_event_name(kind: OverlaySurfaceKind) -> &'static str {
    match kind {
        OverlaySurfaceKind::Hud => OVERLAY_SURFACE_EVENT,
        OverlaySurfaceKind::Notification => OVERLAY_NOTIFICATION_SURFACE_EVENT,
    }
}

pub(super) fn surface_request(
    screen: OverlayScreen,
    placement: OverlayPlacement,
    mode: RecordingOverlayMode,
) -> SurfaceRequest {
    SurfaceRequest {
        mode,
        monitor: screen.bounds,
        notch: screen.notch,
        placement: overlay_placement_for_mode(placement, mode),
    }
}

pub(super) struct OverlayRender<'a> {
    pub(super) app_handle: &'a AppHandle,
    pub(super) covered: Vec<RecordingOverlayMode>,
    pub(super) kind: OverlaySurfaceKind,
    /// `None` renders nothing — overlay off, or no surface right now.
    pub(super) mode: Option<RecordingOverlayMode>,
}

fn transition_frame(
    screen: OverlayScreen,
    placement: OverlayPlacement,
    covered: Vec<RecordingOverlayMode>,
    target: OverlaySurface,
) -> OverlayFrame {
    transition_window(
        screen.bounds,
        covered
            .into_iter()
            .map(|mode| overlay_surface(surface_request(screen, placement, mode)).window),
        target.window,
    )
}

pub(super) fn render_overlay_surface(render: OverlayRender<'_>) -> Result<(), String> {
    let label = surface_window_label(render.kind);
    let Some(window) = render.app_handle.get_webview_window(label) else {
        return Ok(());
    };
    let Some(mode) = render.mode else {
        return withdraw_overlay_surface(render.app_handle, &window, render.kind);
    };
    let settings = settings::get_settings(render.app_handle);
    let placement = OverlayPlacement::from_settings(&settings);
    // shown before its frame is known, the webview never gets a surface and the window stays empty forever
    let Some(screen) = overlay_screen(render.app_handle) else {
        let _ = withdraw_overlay_surface(render.app_handle, &window, render.kind);
        return Err("No monitor is available for the overlay".to_string());
    };
    show_overlay_window(render.app_handle, &window, label)?;
    let request = surface_request(screen, placement, mode);
    #[cfg(target_os = "linux")]
    super::layout::update_wayland_anchors(&window, request.placement);
    let surface = overlay_surface(request);
    let frame = transition_frame(screen, placement, render.covered, surface);
    let publish = || {
        let _ = render.app_handle.emit_to(
            label,
            surface_event_name(render.kind),
            overlay_surface_payload(request, frame),
        );
    };
    // grow first to keep the island inside the canvas; shrinking, the webview needs the origin before the frame moves
    let grows = frame_grows(&window, frame);
    if !grows {
        publish();
    }
    apply_absolute_overlay_frame(&window, frame)?;
    if grows {
        publish();
    }
    configure_overlay_interaction(
        render.app_handle,
        &window,
        label,
        mode,
        surface_hover_box(request, frame),
    )
}

fn withdraw_overlay_surface(
    app_handle: &AppHandle,
    window: &WebviewWindow,
    kind: OverlaySurfaceKind,
) -> Result<(), String> {
    let label = surface_window_label(kind);
    let _ = app_handle.emit_to(
        label,
        surface_event_name(kind),
        Option::<OverlaySurfacePayload>::None,
    );
    hide_overlay_window(app_handle, window, label)
}

fn frame_grows(window: &WebviewWindow, frame: OverlayFrame) -> bool {
    current_window_frame(window)
        .is_none_or(|current| frame.width > current.width || frame.height > current.height)
}

pub(super) fn overlay_surface_payload_for(
    app_handle: &AppHandle,
    kind: OverlaySurfaceKind,
    mode: RecordingOverlayMode,
) -> Option<OverlaySurfacePayload> {
    let settings = settings::get_settings(app_handle);
    let placement = OverlayPlacement::from_settings(&settings);
    let screen = overlay_screen(app_handle)?;
    let window = app_handle.get_webview_window(surface_window_label(kind))?;
    let request = surface_request(screen, placement, mode);
    let frame = current_window_frame(&window).unwrap_or(overlay_surface(request).window);
    overlay_surface_payload(request, frame)
}

pub(super) fn release_recording_overlay_focus(app_handle: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos_panel::release_key(app_handle, RECORDING_OVERLAY_LABEL)?;
        macos_panel::release_key(app_handle, OVERLAY_NOTIFICATION_LABEL)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
        Ok(())
    }
}

fn current_window_frame(window: &WebviewWindow) -> Option<OverlayFrame> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    Some(OverlayFrame {
        height: f64::from(size.height) / scale,
        width: f64::from(size.width) / scale,
        x: f64::from(position.x) / scale,
        y: f64::from(position.y) / scale,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum FrameOperation {
    Move,
    Resize,
}

fn frame_operation_order(current_size: (f64, f64), target: OverlayFrame) -> [FrameOperation; 2] {
    if target.width > current_size.0 || target.height > current_size.1 {
        [FrameOperation::Move, FrameOperation::Resize]
    } else {
        [FrameOperation::Resize, FrameOperation::Move]
    }
}

pub(super) fn apply_absolute_overlay_frame(
    overlay_window: &WebviewWindow,
    frame: OverlayFrame,
) -> Result<(), String> {
    let physical_size = overlay_window
        .inner_size()
        .map_err(|error| format!("Failed to read overlay size: {error}"))?;
    let scale = overlay_window
        .scale_factor()
        .map_err(|error| format!("Failed to read overlay scale factor: {error}"))?;
    let current_size = (
        f64::from(physical_size.width) / scale,
        f64::from(physical_size.height) / scale,
    );
    for operation in frame_operation_order(current_size, frame) {
        match operation {
            FrameOperation::Move => overlay_window
                .set_position(tauri::Position::Logical(tauri::LogicalPosition {
                    x: frame.x,
                    y: frame.y,
                }))
                .map_err(|error| format!("Failed to position overlay: {error}"))?,
            FrameOperation::Resize => overlay_window
                .set_size(tauri::Size::Logical(tauri::LogicalSize {
                    width: frame.width,
                    height: frame.height,
                }))
                .map_err(|error| format!("Failed to resize overlay: {error}"))?,
        }
    }
    Ok(())
}

/// Re-ordering a visible window blinks it, so a reposition never pays for a show it does not need.
fn show_overlay_window(
    app_handle: &AppHandle,
    _overlay_window: &WebviewWindow,
    _label: &'static str,
) -> Result<(), String> {
    if _overlay_window.is_visible().unwrap_or(false) {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    return macos_panel::show(app_handle, _label);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
        _overlay_window
            .show()
            .map_err(|error| format!("Failed to show overlay: {error}"))
    }
}

fn hide_overlay_window(
    app_handle: &AppHandle,
    _overlay_window: &WebviewWindow,
    _label: &'static str,
) -> Result<(), String> {
    if !_overlay_window.is_visible().unwrap_or(true) {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    return macos_panel::hide(app_handle, _label);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app_handle;
        _overlay_window
            .hide()
            .map_err(|error| format!("Failed to hide disabled overlay: {error}"))
    }
}

fn configure_overlay_interaction(
    app_handle: &AppHandle,
    _overlay_window: &WebviewWindow,
    _label: &'static str,
    mode: RecordingOverlayMode,
    hover: OverlayBoxPayload,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    macos_panel::set_layout(app_handle, _label, mode, hover)?;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_handle, hover);
        let focusable = overlay_mode_accepts_keyboard(mode);
        _overlay_window
            .set_focusable(focusable)
            .map_err(|error| format!("Failed to update overlay focusability: {error}"))?;
        if focusable {
            let _ = _overlay_window.set_focus();
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "window_tests.rs"]
mod tests;
