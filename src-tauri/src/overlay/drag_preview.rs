use super::layout::{MonitorBounds, OverlayFrame, OverlayPlacement};
use crate::settings::OverlayDockEdge;

/// The held island must clear the diagonal by this much before the dock edge flips.
pub(super) const SNAP_EDGE_HYSTERESIS: f64 = 32.0;

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SnapPreviewPayload {
    pub(super) anchor: OverlayDockEdge,
    pub(super) height: f64,
    pub(super) width: f64,
    pub(super) x: f64,
    pub(super) y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct SnapTarget {
    pub(super) island: OverlayFrame,
    pub(super) monitor: MonitorBounds,
    pub(super) placement: OverlayPlacement,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct PaintedPreview {
    pub(super) monitor: MonitorBounds,
    pub(super) payload: SnapPreviewPayload,
}

/// Where on the island the pointer holds it — the preview tracks the island, never the pointer itself.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(super) struct GrabOffset {
    pub(super) x: f64,
    pub(super) y: f64,
}

/// The placement a release would keep, plus the silhouette already on screen.
#[derive(Clone, Copy, Debug, Default)]
pub(super) struct DragSession {
    pub(super) grab: GrabOffset,
    pub(super) painted: Option<PaintedPreview>,
    pub(super) placement: Option<OverlayPlacement>,
}

fn center(frame: OverlayFrame) -> (f64, f64) {
    (frame.x + frame.width / 2.0, frame.y + frame.height / 2.0)
}

pub(super) fn grab_offset(island: OverlayFrame, pointer: OverlayFrame) -> GrabOffset {
    let (island_x, island_y) = center(island);
    let (pointer_x, pointer_y) = center(pointer);
    GrabOffset {
        x: island_x - pointer_x,
        y: island_y - pointer_y,
    }
}

pub(super) fn held_island(pointer: OverlayFrame, grab: GrabOffset) -> OverlayFrame {
    let (pointer_x, pointer_y) = center(pointer);
    OverlayFrame {
        height: 0.0,
        width: 0.0,
        x: pointer_x + grab.x,
        y: pointer_y + grab.y,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum PreviewPaint {
    /// Re-frame the window over the target monitor, publish, then reveal it.
    Mount,
    Publish,
    Skip,
}

/// Whole logical pixels: sub-pixel pointer travel must not repaint a frame.
pub(super) fn painted_preview(target: SnapTarget) -> PaintedPreview {
    PaintedPreview {
        monitor: target.monitor,
        payload: SnapPreviewPayload {
            anchor: target.placement.resolved_anchor(),
            height: target.island.height.round(),
            width: target.island.width.round(),
            x: (target.island.x - target.monitor.x).round(),
            y: (target.island.y - target.monitor.y).round(),
        },
    }
}

pub(super) fn preview_paint(painted: Option<PaintedPreview>, next: PaintedPreview) -> PreviewPaint {
    let Some(current) = painted else {
        return PreviewPaint::Mount;
    };
    if current.monitor != next.monitor {
        return PreviewPaint::Mount;
    }
    if current.payload == next.payload {
        return PreviewPaint::Skip;
    }
    PreviewPaint::Publish
}

#[cfg(test)]
#[path = "drag_preview_tests.rs"]
mod tests;
