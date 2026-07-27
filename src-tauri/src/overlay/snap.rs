use super::drag_preview::{
    painted_preview, preview_paint, DragSession, PaintedPreview, PreviewPaint, SnapTarget,
    SNAP_EDGE_HYSTERESIS,
};
use super::layout::{
    dock_location_from_frame_with_hysteresis, MonitorBounds, OverlayFrame, OverlayPlacement,
    RecordingOverlayMode,
};
#[cfg(target_os = "macos")]
use super::macos_panel;
use super::monitor::{cursor_position, logical_monitor_bounds, overlay_screen};
use super::surface::{overlay_surface, SurfaceRequest};
use super::window::{apply_absolute_overlay_frame, RECORDING_OVERLAY_LABEL};
use super::window_modes::update_overlay_position;
use crate::settings::{self, OverlayDockEdge, OverlayPosition};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, WebviewWindowBuilder};

pub(super) const SNAP_PREVIEW_LABEL: &str = "recording_overlay_snap_preview";
const SNAP_PREVIEW_EVENT: &str = "overlay-snap-preview";
const SNAP_PREVIEW_DISMISS_EVENT: &str = "overlay-snap-preview-dismiss";
const DRAG_SETTLED_EVENT: &str = "overlay-drag-settled";
/// Drop target always shows the interactive island, never the resting sliver.
const PREVIEW_MODE: RecordingOverlayMode = RecordingOverlayMode::Actions;

static DRAG_SESSION: Mutex<Option<DragSession>> = Mutex::new(None);

fn current_session() -> Option<DragSession> {
    match DRAG_SESSION.lock() {
        Ok(session) => *session,
        Err(poisoned) => **poisoned.get_ref(),
    }
}

fn store_session(next: Option<DragSession>) {
    match DRAG_SESSION.lock() {
        Ok(mut session) => *session = next,
        Err(poisoned) => *poisoned.into_inner() = next,
    }
}

pub(super) fn drag_is_active() -> bool {
    current_session().is_some()
}

pub(super) fn build_snap_preview(app_handle: &AppHandle) -> Result<WebviewWindow, String> {
    let monitor_bounds = overlay_screen(app_handle)
        .map(|screen| screen.bounds)
        .unwrap_or(MonitorBounds {
            height: 1.0,
            width: 1.0,
            x: 0.0,
            y: 0.0,
        });
    let preview = WebviewWindowBuilder::new(
        app_handle,
        SNAP_PREVIEW_LABEL,
        tauri::WebviewUrl::App("src/overlay/snap-preview.html".into()),
    )
    .title("Echo Dock Preview")
    .position(monitor_bounds.x, monitor_bounds.y)
    .inner_size(monitor_bounds.width, monitor_bounds.height)
    .resizable(false)
    .shadow(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .decorations(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .transparent(true)
    .focusable(false)
    .focused(false)
    .visible(false)
    .build()
    .map_err(|error| format!("Failed to build snap preview: {error}"))?;
    preview
        .set_ignore_cursor_events(true)
        .map_err(|error| format!("Failed to make snap preview click-through: {error}"))?;
    #[cfg(target_os = "macos")]
    macos_panel::configure_snap_preview(&preview)?;
    Ok(preview)
}

fn pointer_frame(window: &WebviewWindow) -> Result<(MonitorBounds, OverlayFrame), String> {
    if let Some((cursor_x, cursor_y)) = cursor_position() {
        let monitor = window
            .monitor_from_point(cursor_x, cursor_y)
            .map_err(|error| format!("Failed to resolve pointer monitor: {error}"))?
            .ok_or_else(|| "No monitor contains the pointer".to_string())?;
        #[cfg(target_os = "windows")]
        let logical_cursor = {
            let monitor_scale = monitor.scale_factor();
            (cursor_x / monitor_scale, cursor_y / monitor_scale)
        };
        #[cfg(not(target_os = "windows"))]
        let logical_cursor = (cursor_x, cursor_y);
        return Ok((
            logical_monitor_bounds(&monitor),
            OverlayFrame {
                height: 0.0,
                width: 0.0,
                x: logical_cursor.0,
                y: logical_cursor.1,
            },
        ));
    }
    window_center_frame(window)
}

fn window_center_frame(window: &WebviewWindow) -> Result<(MonitorBounds, OverlayFrame), String> {
    let physical_position = window
        .outer_position()
        .map_err(|error| format!("Failed to read overlay position: {error}"))?;
    let physical_size = window
        .outer_size()
        .map_err(|error| format!("Failed to read overlay size: {error}"))?;
    let physical_center_x = f64::from(physical_position.x) + f64::from(physical_size.width) / 2.0;
    let physical_center_y = f64::from(physical_position.y) + f64::from(physical_size.height) / 2.0;
    #[cfg(target_os = "windows")]
    let monitor_point = (physical_center_x, physical_center_y);
    #[cfg(not(target_os = "windows"))]
    let monitor_point = {
        let window_scale = window
            .scale_factor()
            .map_err(|error| format!("Failed to read overlay scale factor: {error}"))?;
        (
            physical_center_x / window_scale,
            physical_center_y / window_scale,
        )
    };
    let monitor = window
        .monitor_from_point(monitor_point.0, monitor_point.1)
        .map_err(|error| format!("Failed to resolve overlay monitor: {error}"))?
        .ok_or_else(|| "No monitor contains the overlay center".to_string())?;
    let monitor_scale = monitor.scale_factor();
    Ok((
        logical_monitor_bounds(&monitor),
        OverlayFrame {
            height: f64::from(physical_size.height) / monitor_scale,
            width: f64::from(physical_size.width) / monitor_scale,
            x: f64::from(physical_position.x) / monitor_scale,
            y: f64::from(physical_position.y) / monitor_scale,
        },
    ))
}

fn resolve_snap_target(
    app_handle: &AppHandle,
    preferred_edge: Option<OverlayDockEdge>,
) -> Result<SnapTarget, String> {
    let window = app_handle
        .get_webview_window(RECORDING_OVERLAY_LABEL)
        .ok_or_else(|| "Recording overlay window is unavailable".to_string())?;
    let (monitor, frame) = pointer_frame(&window)?;
    let (dock_edge, dock_offset) = dock_location_from_frame_with_hysteresis(
        monitor,
        frame,
        preferred_edge,
        SNAP_EDGE_HYSTERESIS,
    );
    let placement = OverlayPlacement {
        dock_edge,
        dock_offset,
        position: OverlayPosition::Edge,
    };
    let notch = overlay_screen(app_handle).and_then(|screen| screen.notch);
    let surface = overlay_surface(SurfaceRequest {
        mode: PREVIEW_MODE,
        monitor,
        notch,
        placement,
    });
    Ok(SnapTarget {
        island: surface.island,
        monitor,
        placement,
    })
}

fn paint_snap_preview(
    app_handle: &AppHandle,
    paint: PreviewPaint,
    painted: PaintedPreview,
) -> Result<(), String> {
    if paint == PreviewPaint::Skip {
        return Ok(());
    }
    let preview = app_handle
        .get_webview_window(SNAP_PREVIEW_LABEL)
        .ok_or_else(|| "Recording overlay snap preview is unavailable".to_string())?;
    if paint == PreviewPaint::Mount {
        apply_absolute_overlay_frame(
            &preview,
            OverlayFrame {
                height: painted.monitor.height,
                width: painted.monitor.width,
                x: painted.monitor.x,
                y: painted.monitor.y,
            },
        )?;
    }
    preview
        .emit(SNAP_PREVIEW_EVENT, painted.payload)
        .map_err(|error| format!("Failed to render snap preview: {error}"))?;
    if paint == PreviewPaint::Mount {
        preview
            .show()
            .map_err(|error| format!("Failed to show snap preview: {error}"))?;
    }
    Ok(())
}

/// Pointer samples outrun the compositor — whatever the preview already shows is left alone.
pub(super) fn refresh_snap_preview(app_handle: &AppHandle) -> Result<(), String> {
    let Some(session) = current_session() else {
        return Ok(());
    };
    let target = resolve_snap_target(
        app_handle,
        session.placement.map(|placement| placement.dock_edge),
    )?;
    let painted = painted_preview(target);
    // A release or cancel can land while the sample above resolves.
    let Some(session) = current_session() else {
        return Ok(());
    };
    store_session(Some(DragSession {
        painted: Some(painted),
        placement: Some(target.placement),
    }));
    paint_snap_preview(app_handle, preview_paint(session.painted, painted), painted)
}

pub(super) fn begin_snap_preview(app_handle: &AppHandle) -> Result<(), String> {
    store_session(Some(DragSession::default()));
    let result = refresh_snap_preview(app_handle);
    if result.is_err() {
        store_session(None);
    }
    result
}

fn dismiss_preview(app_handle: &AppHandle) -> Result<(), String> {
    let Some(preview) = app_handle.get_webview_window(SNAP_PREVIEW_LABEL) else {
        return Ok(());
    };
    preview
        .emit(SNAP_PREVIEW_DISMISS_EVENT, ())
        .map_err(|error| format!("Failed to dismiss snap preview: {error}"))
}

pub(super) fn cancel_drag(app_handle: &AppHandle) -> Result<(), String> {
    if current_session().is_none() {
        return Ok(());
    }
    store_session(None);
    let dismissed = dismiss_preview(app_handle);
    let _ = app_handle.emit_to(RECORDING_OVERLAY_LABEL, DRAG_SETTLED_EVENT, ());
    dismissed
}

fn drop_placement(app_handle: &AppHandle, session: DragSession) -> Option<OverlayPlacement> {
    session.placement.or_else(|| {
        resolve_snap_target(app_handle, None)
            .ok()
            .map(|target| target.placement)
    })
}

/// Idempotent — native mouse-up and webview pointer release both land here; first one owns the drop.
pub(super) fn finish_drag(app_handle: &AppHandle) -> Result<(), String> {
    let Some(session) = current_session() else {
        return Ok(());
    };
    store_session(None);
    if let Some(placement) = drop_placement(app_handle, session) {
        settings::update_settings(app_handle, |settings| {
            settings.overlay_position = OverlayPosition::Edge;
            settings.overlay_dock_edge = placement.dock_edge;
            settings.overlay_dock_offset = placement.dock_offset;
        });
    }
    let dismissed = dismiss_preview(app_handle);
    update_overlay_position(app_handle);
    let _ = app_handle.emit_to(RECORDING_OVERLAY_LABEL, DRAG_SETTLED_EVENT, ());
    dismissed
}

pub(super) fn set_dock_edge(app_handle: &AppHandle, edge: &str) -> Result<(), String> {
    let dock_edge = parse_dock_edge(edge)?;
    settings::update_settings(app_handle, |settings| {
        settings.overlay_position = OverlayPosition::Edge;
        settings.overlay_dock_edge = dock_edge;
    });
    update_overlay_position(app_handle);
    Ok(())
}

fn parse_dock_edge(edge: &str) -> Result<OverlayDockEdge, String> {
    match edge {
        "left" => Ok(OverlayDockEdge::Left),
        "right" => Ok(OverlayDockEdge::Right),
        "top" => Ok(OverlayDockEdge::Top),
        "bottom" => Ok(OverlayDockEdge::Bottom),
        _ => Err(format!("Unknown overlay dock edge: {edge}")),
    }
}

#[cfg(test)]
mod tests {
    use super::parse_dock_edge;
    use crate::settings::OverlayDockEdge;

    #[test]
    fn dock_edge_parser_accepts_named_edges_and_rejects_unknown_values() {
        assert_eq!(parse_dock_edge("left"), Ok(OverlayDockEdge::Left));
        assert_eq!(parse_dock_edge("right"), Ok(OverlayDockEdge::Right));
        assert_eq!(parse_dock_edge("top"), Ok(OverlayDockEdge::Top));
        assert_eq!(parse_dock_edge("bottom"), Ok(OverlayDockEdge::Bottom));
        assert_eq!(
            parse_dock_edge("center"),
            Err("Unknown overlay dock edge: center".to_string())
        );
    }
}
