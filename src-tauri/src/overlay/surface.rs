use super::layout::{
    compute_overlay_geometry_for_size, overlay_mode_is_resident, overlay_window_dimensions,
    placement_is_side_docked, MonitorBounds, OverlayFrame, OverlayPlacement, OverlayPresentation,
    RecordingOverlayMode,
};
use super::monitor::OverlayNotchGeometry;
use crate::settings::{OverlayDockEdge, OverlayPosition};

const SURFACE_INSET: f64 = 4.0;
const COMPACT_BAR: (f64, f64) = (38.0, 5.0);
const SIDE_DOCK_BAR: (f64, f64) = (32.0, 104.0);
const ACTIONS_ISLAND: (f64, f64) = (128.0, 40.0);

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct OverlaySurface {
    pub(super) island: OverlayFrame,
    pub(super) monitor: MonitorBounds,
    pub(super) window: OverlayFrame,
}

#[derive(Clone, Copy, Debug)]
pub(super) struct SurfaceRequest {
    pub(super) mode: RecordingOverlayMode,
    pub(super) monitor: MonitorBounds,
    pub(super) notch: Option<OverlayNotchGeometry>,
    pub(super) placement: OverlayPlacement,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OverlayBoxPayload {
    pub(crate) height: f64,
    pub(crate) width: f64,
    pub(crate) x: f64,
    pub(crate) y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OverlayNotchBoxPayload {
    pub(crate) height: f64,
    pub(crate) width: f64,
    pub(crate) x: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OverlayOriginPayload {
    pub(crate) x: f64,
    pub(crate) y: f64,
}

/// Everything the webview needs to draw one frame: island boxes in window-local
/// coordinates plus the window origin, so a pure window move never re-animates.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OverlaySurfacePayload {
    pub(crate) anchor: OverlayDockEdge,
    pub(crate) island: OverlayBoxPayload,
    pub(crate) notch: Option<OverlayNotchBoxPayload>,
    pub(crate) presentation: OverlayPresentation,
    pub(crate) window: OverlayOriginPayload,
}

struct SurfaceInsets {
    bottom: f64,
    left: f64,
    right: f64,
    top: f64,
}

fn surface_insets(placement: OverlayPlacement) -> SurfaceInsets {
    let mut insets = SurfaceInsets {
        bottom: SURFACE_INSET,
        left: SURFACE_INSET,
        right: SURFACE_INSET,
        top: SURFACE_INSET,
    };
    if placement.position != OverlayPosition::Edge {
        return insets;
    }
    match placement.dock_edge {
        OverlayDockEdge::Bottom => insets.bottom = 0.0,
        OverlayDockEdge::Left => insets.left = 0.0,
        OverlayDockEdge::Right => insets.right = 0.0,
        OverlayDockEdge::Top => insets.top = 0.0,
    }
    insets
}

/// Hardware notch owns the top strip of its screen: every top-anchored surface
/// starts below it, and the window keeps the strip so the bridge can paint it.
fn notch_top_inset(placement: OverlayPlacement, notch: Option<OverlayNotchGeometry>) -> f64 {
    match notch {
        Some(notch) if placement.resolved_anchor() == OverlayDockEdge::Top => notch.top_inset,
        _ => 0.0,
    }
}

fn notch_center_shift(placement: OverlayPlacement, notch: Option<OverlayNotchGeometry>) -> f64 {
    match notch {
        Some(notch) if placement.position == OverlayPosition::Top => notch.center_offset,
        _ => 0.0,
    }
}

/// A side dock keeps one size: it already shows every action, so growing it
/// under the pointer would only shift the icons the user is aiming at.
fn resident_island_dimensions(
    mode: RecordingOverlayMode,
    placement: OverlayPlacement,
) -> (f64, f64) {
    if placement_is_side_docked(placement) {
        return SIDE_DOCK_BAR;
    }
    if mode == RecordingOverlayMode::Compact {
        return COMPACT_BAR;
    }
    ACTIONS_ISLAND
}

fn clamped_origin(origin: f64, size: f64, bound_origin: f64, bound_size: f64) -> f64 {
    if size >= bound_size {
        return bound_origin;
    }
    origin.clamp(bound_origin, bound_origin + bound_size - size)
}

fn window_frame(request: SurfaceRequest) -> OverlayFrame {
    let (width, base_height) = overlay_window_dimensions(request.mode, request.placement);
    let height = base_height + notch_top_inset(request.placement, request.notch);
    let (x, y, width, height) = compute_overlay_geometry_for_size(
        request.monitor,
        request.placement,
        width,
        height.min(request.monitor.height),
    );
    OverlayFrame {
        height,
        width,
        x: clamped_origin(
            x + notch_center_shift(request.placement, request.notch),
            width,
            request.monitor.x,
            request.monitor.width,
        ),
        y,
    }
}

fn island_content_box(window: OverlayFrame, request: SurfaceRequest) -> OverlayFrame {
    let insets = surface_insets(request.placement);
    let top = insets.top + notch_top_inset(request.placement, request.notch);
    OverlayFrame {
        height: (window.height - top - insets.bottom).max(0.0),
        width: (window.width - insets.left - insets.right).max(0.0),
        x: window.x + insets.left,
        y: window.y + top,
    }
}

fn aligned_island(
    content: OverlayFrame,
    size: (f64, f64),
    anchor: OverlayDockEdge,
) -> OverlayFrame {
    let (width, height) = size;
    let centered_x = content.x + (content.width - width) / 2.0;
    let centered_y = content.y + (content.height - height) / 2.0;
    let (x, y) = match anchor {
        OverlayDockEdge::Bottom => (centered_x, content.y + content.height - height),
        OverlayDockEdge::Left => (content.x, centered_y),
        OverlayDockEdge::Right => (content.x + content.width - width, centered_y),
        OverlayDockEdge::Top => (centered_x, content.y),
    };
    OverlayFrame {
        height,
        width,
        x,
        y,
    }
}

pub(super) fn overlay_surface(request: SurfaceRequest) -> OverlaySurface {
    let window = window_frame(request);
    let content = island_content_box(window, request);
    let size = if overlay_mode_is_resident(request.mode) {
        resident_island_dimensions(request.mode, request.placement)
    } else {
        (content.width, content.height)
    };
    OverlaySurface {
        island: aligned_island(content, size, request.placement.resolved_anchor()),
        monitor: request.monitor,
        window,
    }
}

fn union_frames(first: OverlayFrame, second: OverlayFrame) -> OverlayFrame {
    let x = first.x.min(second.x);
    let y = first.y.min(second.y);
    OverlayFrame {
        height: (first.y + first.height).max(second.y + second.height) - y,
        width: (first.x + first.width).max(second.x + second.width) - x,
        x,
        y,
    }
}

/// The window covers both the outgoing and incoming surfaces for the whole
/// morph, so the island slides inside a window that never moves under it.
pub(super) fn transition_window(
    monitor: MonitorBounds,
    frames: impl IntoIterator<Item = OverlayFrame>,
    target: OverlayFrame,
) -> OverlayFrame {
    let union = frames
        .into_iter()
        .fold(target, |merged, frame| union_frames(merged, frame));
    let width = union.width.min(monitor.width);
    let height = union.height.min(monitor.height);
    OverlayFrame {
        height,
        width,
        x: clamped_origin(union.x, width, monitor.x, monitor.width),
        y: clamped_origin(union.y, height, monitor.y, monitor.height),
    }
}

fn window_local_box(island: OverlayFrame, window: OverlayFrame) -> OverlayBoxPayload {
    OverlayBoxPayload {
        height: island.height,
        width: island.width,
        x: island.x - window.x,
        y: island.y - window.y,
    }
}

/// Native hit testing follows the drawn island, not the transparent canvas
/// around it. Transient surfaces fill their canvas, so they own all of it.
pub(super) fn surface_hover_box(
    request: SurfaceRequest,
    window: OverlayFrame,
) -> OverlayBoxPayload {
    if overlay_mode_is_resident(request.mode) {
        return island_box(request, window);
    }
    OverlayBoxPayload {
        height: window.height,
        width: window.width,
        x: 0.0,
        y: 0.0,
    }
}

fn notch_box_payload(
    request: SurfaceRequest,
    window: OverlayFrame,
) -> Option<OverlayNotchBoxPayload> {
    let notch = request.notch?;
    let center = request.monitor.x + request.monitor.width / 2.0 + notch.center_offset;
    Some(OverlayNotchBoxPayload {
        height: notch.top_inset,
        width: notch.width,
        x: center - notch.width / 2.0 - window.x,
    })
}

fn island_box(request: SurfaceRequest, window: OverlayFrame) -> OverlayBoxPayload {
    window_local_box(overlay_surface(request).island, window)
}

pub(super) fn overlay_surface_payload(
    request: SurfaceRequest,
    window: OverlayFrame,
) -> Option<OverlaySurfacePayload> {
    let presentation = match request.placement.position {
        OverlayPosition::None => return None,
        OverlayPosition::Edge => OverlayPresentation::Docked,
        OverlayPosition::Bottom | OverlayPosition::Top => OverlayPresentation::Bar,
    };
    Some(OverlaySurfacePayload {
        anchor: request.placement.resolved_anchor(),
        island: island_box(request, window),
        notch: notch_box_payload(request, window),
        presentation,
        window: OverlayOriginPayload {
            x: window.x,
            y: window.y,
        },
    })
}

#[cfg(test)]
#[path = "surface_tests.rs"]
mod tests;
