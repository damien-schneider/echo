use crate::settings::{AppSettings, OverlayDockEdge, OverlayPosition};
#[cfg(target_os = "linux")]
use tauri::WebviewWindow;

const COMPACT_OVERLAY_WIDTH: f64 = 64.0;
const COMPACT_OVERLAY_HEIGHT: f64 = 28.0;
const ACTIONS_OVERLAY_WIDTH: f64 = 136.0;
const ACTIONS_OVERLAY_HEIGHT: f64 = 48.0;
/// Notch-bridged widths carry 20px of slack past the content so the flank controls fit either side.
const RECORDING_OVERLAY_WIDTH: f64 = 354.0;
const RECORDING_OVERLAY_HEIGHT: f64 = 96.0;
const PANEL_OVERLAY_WIDTH: f64 = 420.0;
const PANEL_OVERLAY_HEIGHT: f64 = 220.0;
pub(super) const CHAT_OVERLAY_WIDTH: f64 = 680.0;
pub(super) const CHAT_OVERLAY_HEIGHT: f64 = 620.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RecordingOverlayMode {
    Compact,
    Actions,
    Recording,
    Panel,
    /// A transcript Echo could not place, held out with a copy and a send-to-chat.
    Transcript,
    Chat,
}

/// HUD is the draggable handle, notification the notch surface — they never trade modes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum OverlaySurfaceKind {
    Hud,
    Notification,
}

pub(super) fn surface_kind_for_mode(mode: RecordingOverlayMode) -> OverlaySurfaceKind {
    if overlay_mode_is_resident(mode) {
        return OverlaySurfaceKind::Hud;
    }
    OverlaySurfaceKind::Notification
}

/// Notification owns the top-centre strip, so a HUD anchored there stands down while activity shows.
pub(super) fn hud_yields_to_notification(placement: OverlayPlacement) -> bool {
    placement.resolved_anchor() == OverlayDockEdge::Top
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct OverlayPlacement {
    pub(super) position: OverlayPosition,
    pub(super) dock_edge: OverlayDockEdge,
    pub(super) dock_offset: f64,
}

impl OverlayPlacement {
    pub(super) fn from_settings(settings: &AppSettings) -> Self {
        Self {
            position: settings.overlay_position,
            dock_edge: settings.overlay_dock_edge,
            dock_offset: settings.overlay_dock_offset,
        }
    }

    pub(super) fn resolved_anchor(self) -> OverlayDockEdge {
        match self.position {
            OverlayPosition::Edge => self.dock_edge,
            OverlayPosition::Top | OverlayPosition::None => OverlayDockEdge::Top,
            OverlayPosition::Bottom => OverlayDockEdge::Bottom,
        }
    }
}

pub(super) fn overlay_placement_for_mode(
    placement: OverlayPlacement,
    mode: RecordingOverlayMode,
) -> OverlayPlacement {
    if overlay_mode_is_resident(mode) {
        return placement;
    }
    OverlayPlacement {
        position: OverlayPosition::Top,
        dock_edge: OverlayDockEdge::Top,
        dock_offset: 0.5,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum OverlayPresentation {
    Docked,
    Bar,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct OverlayFrame {
    pub(super) height: f64,
    pub(super) width: f64,
    pub(super) x: f64,
    pub(super) y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct MonitorBounds {
    pub(super) x: f64,
    pub(super) y: f64,
    pub(super) width: f64,
    pub(super) height: f64,
}

pub(super) fn overlay_interaction_dimensions(mode: RecordingOverlayMode) -> (f64, f64) {
    match mode {
        RecordingOverlayMode::Compact => (COMPACT_OVERLAY_WIDTH, COMPACT_OVERLAY_HEIGHT),
        RecordingOverlayMode::Actions => (ACTIONS_OVERLAY_WIDTH, ACTIONS_OVERLAY_HEIGHT),
        RecordingOverlayMode::Recording => (RECORDING_OVERLAY_WIDTH, RECORDING_OVERLAY_HEIGHT),
        RecordingOverlayMode::Panel | RecordingOverlayMode::Transcript => {
            (PANEL_OVERLAY_WIDTH, PANEL_OVERLAY_HEIGHT)
        }
        RecordingOverlayMode::Chat => (CHAT_OVERLAY_WIDTH, CHAT_OVERLAY_HEIGHT),
    }
}

pub(super) fn placement_is_side_docked(placement: OverlayPlacement) -> bool {
    placement.position == OverlayPosition::Edge
        && matches!(
            placement.resolved_anchor(),
            OverlayDockEdge::Left | OverlayDockEdge::Right
        )
}

pub(super) fn overlay_window_dimensions(
    mode: RecordingOverlayMode,
    placement: OverlayPlacement,
) -> (f64, f64) {
    let side_docked = placement_is_side_docked(placement);
    if overlay_mode_is_resident(mode) && side_docked {
        return (ACTIONS_OVERLAY_HEIGHT, ACTIONS_OVERLAY_WIDTH);
    }

    #[cfg(target_os = "macos")]
    if overlay_mode_is_resident(mode) {
        return (ACTIONS_OVERLAY_WIDTH, ACTIONS_OVERLAY_HEIGHT);
    }

    overlay_interaction_dimensions(mode)
}

pub(super) fn overlay_mode_accepts_keyboard(mode: RecordingOverlayMode) -> bool {
    mode == RecordingOverlayMode::Chat
}

/// Only the idle island reacts to pointer-boundary samples — elsewhere a reveal would stomp the live surface.
pub(super) fn overlay_mode_is_resident(mode: RecordingOverlayMode) -> bool {
    matches!(
        mode,
        RecordingOverlayMode::Compact | RecordingOverlayMode::Actions
    )
}

fn parse_overlay_mode(mode: &str) -> Result<RecordingOverlayMode, String> {
    match mode {
        "compact" => Ok(RecordingOverlayMode::Compact),
        "actions" => Ok(RecordingOverlayMode::Actions),
        "recording" => Ok(RecordingOverlayMode::Recording),
        "panel" => Ok(RecordingOverlayMode::Panel),
        "transcript" => Ok(RecordingOverlayMode::Transcript),
        "chat" => Ok(RecordingOverlayMode::Chat),
        _ => Err(format!("Unknown overlay mode: {mode}")),
    }
}

/// A mode meant for the other surface is a caller bug, not a window that re-shapes itself.
fn parse_mode_for_kind(
    mode: &str,
    kind: OverlaySurfaceKind,
) -> Result<RecordingOverlayMode, String> {
    let parsed = parse_overlay_mode(mode)?;
    if surface_kind_for_mode(parsed) == kind {
        return Ok(parsed);
    }
    Err(format!("Overlay mode {mode} does not belong to {kind:?}"))
}

pub(super) fn parse_hud_mode(mode: &str) -> Result<RecordingOverlayMode, String> {
    parse_mode_for_kind(mode, OverlaySurfaceKind::Hud)
}

pub(super) fn parse_notification_mode(mode: &str) -> Result<RecordingOverlayMode, String> {
    parse_mode_for_kind(mode, OverlaySurfaceKind::Notification)
}

pub(super) fn overlay_initially_visible(position: OverlayPosition) -> bool {
    position != OverlayPosition::None
}

#[cfg(any(target_os = "linux", test))]
pub(super) fn wayland_anchor_edges(placement: OverlayPlacement) -> (bool, bool, bool, bool) {
    match placement.resolved_anchor() {
        OverlayDockEdge::Top => (true, false, false, false),
        OverlayDockEdge::Bottom => (false, true, false, false),
        OverlayDockEdge::Left => (false, false, true, false),
        OverlayDockEdge::Right => (false, false, false, true),
    }
}

fn normalized_offset(offset: f64) -> f64 {
    if offset.is_finite() {
        offset.clamp(0.0, 1.0)
    } else {
        0.5
    }
}

fn centered_origin(origin: f64, extent: f64, size: f64, offset: f64) -> f64 {
    if size >= extent {
        return origin;
    }
    (origin + extent * normalized_offset(offset) - size / 2.0).clamp(origin, origin + extent - size)
}

#[cfg(test)]
pub(super) fn compute_overlay_geometry(
    monitor: MonitorBounds,
    placement: OverlayPlacement,
    mode: RecordingOverlayMode,
) -> (f64, f64, f64, f64) {
    let (width, height) = overlay_window_dimensions(mode, placement);
    compute_overlay_geometry_for_size(monitor, placement, width, height)
}

pub(super) fn compute_overlay_geometry_for_size(
    monitor: MonitorBounds,
    placement: OverlayPlacement,
    width: f64,
    height: f64,
) -> (f64, f64, f64, f64) {
    let (x, y) = match placement.position {
        OverlayPosition::Top | OverlayPosition::None => {
            (monitor.x + (monitor.width - width) / 2.0, monitor.y)
        }
        OverlayPosition::Bottom => (
            monitor.x + (monitor.width - width) / 2.0,
            monitor.y + monitor.height - height,
        ),
        OverlayPosition::Edge => match placement.dock_edge {
            OverlayDockEdge::Left => (
                monitor.x,
                centered_origin(monitor.y, monitor.height, height, placement.dock_offset),
            ),
            OverlayDockEdge::Right => (
                monitor.x + monitor.width - width,
                centered_origin(monitor.y, monitor.height, height, placement.dock_offset),
            ),
            OverlayDockEdge::Top => (
                centered_origin(monitor.x, monitor.width, width, placement.dock_offset),
                monitor.y,
            ),
            OverlayDockEdge::Bottom => (
                centered_origin(monitor.x, monitor.width, width, placement.dock_offset),
                monitor.y + monitor.height - height,
            ),
        },
    };
    (x, y, width, height)
}

pub(super) fn dock_location_from_frame_with_hysteresis(
    monitor: MonitorBounds,
    frame: OverlayFrame,
    preferred_edge: Option<OverlayDockEdge>,
    hysteresis: f64,
) -> (OverlayDockEdge, f64) {
    let center_x = frame.x + frame.width / 2.0;
    let center_y = frame.y + frame.height / 2.0;
    let candidates = [
        (
            OverlayDockEdge::Right,
            (monitor.x + monitor.width - center_x).abs(),
        ),
        (OverlayDockEdge::Left, (center_x - monitor.x).abs()),
        (
            OverlayDockEdge::Bottom,
            (monitor.y + monitor.height - center_y).abs(),
        ),
        (OverlayDockEdge::Top, (center_y - monitor.y).abs()),
    ];
    let mut nearest = candidates[0];
    for candidate in candidates.into_iter().skip(1) {
        if candidate.1 < nearest.1 {
            nearest = candidate;
        }
    }
    let switch_margin = if hysteresis.is_finite() {
        hysteresis.max(0.0)
    } else {
        0.0
    };
    let selected = preferred_edge
        .and_then(|edge| candidates.into_iter().find(|candidate| candidate.0 == edge))
        .filter(|candidate| candidate.1 <= nearest.1 + switch_margin)
        .unwrap_or(nearest);
    let offset = match selected.0 {
        OverlayDockEdge::Left | OverlayDockEdge::Right => {
            if monitor.height > 0.0 {
                (center_y - monitor.y) / monitor.height
            } else {
                0.5
            }
        }
        OverlayDockEdge::Top | OverlayDockEdge::Bottom => {
            if monitor.width > 0.0 {
                (center_x - monitor.x) / monitor.width
            } else {
                0.5
            }
        }
    };
    (selected.0, normalized_offset(offset))
}

#[cfg(test)]
pub(super) fn dock_location_from_frame(
    monitor: MonitorBounds,
    frame: OverlayFrame,
) -> (OverlayDockEdge, f64) {
    dock_location_from_frame_with_hysteresis(monitor, frame, None, 0.0)
}

#[cfg(target_os = "linux")]
pub(super) fn update_wayland_anchors(overlay_window: &WebviewWindow, placement: OverlayPlacement) {
    if !crate::wayland::is_wayland() {
        return;
    }
    use gtk_layer_shell::LayerShell;
    match overlay_window.gtk_window() {
        Ok(gtk_window) if gtk_layer_shell::is_supported() => {
            let (anchor_top, anchor_bottom, anchor_left, anchor_right) =
                wayland_anchor_edges(placement);
            gtk_window.set_anchor(gtk_layer_shell::Edge::Top, anchor_top);
            gtk_window.set_anchor(gtk_layer_shell::Edge::Bottom, anchor_bottom);
            gtk_window.set_anchor(gtk_layer_shell::Edge::Left, anchor_left);
            gtk_window.set_anchor(gtk_layer_shell::Edge::Right, anchor_right);
            log::debug!("[Overlay] Updated layer-shell anchors for placement: {placement:?}");
        }
        Ok(_) => {}
        Err(error) => log::warn!("[Overlay] Could not get GTK window for anchor update: {error:?}"),
    }
    crate::wayland::present_gnome_overlay(overlay_window);
}

#[cfg(test)]
#[path = "layout_tests.rs"]
mod tests;
