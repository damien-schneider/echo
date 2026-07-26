use super::{painted_preview, preview_paint, PreviewPaint, SnapTarget};
use crate::overlay::layout::{MonitorBounds, OverlayFrame, OverlayPlacement};
use crate::settings::{OverlayDockEdge, OverlayPosition};

const MONITOR: MonitorBounds = MonitorBounds {
    height: 900.0,
    width: 1440.0,
    x: 0.0,
    y: 0.0,
};

const SECOND_MONITOR: MonitorBounds = MonitorBounds {
    height: 1080.0,
    width: 1920.0,
    x: 1440.0,
    y: -180.0,
};

fn target(monitor: MonitorBounds, edge: OverlayDockEdge, island: OverlayFrame) -> SnapTarget {
    SnapTarget {
        island,
        monitor,
        placement: OverlayPlacement {
            dock_edge: edge,
            dock_offset: 0.5,
            position: OverlayPosition::Edge,
        },
    }
}

fn right_dock(monitor: MonitorBounds, y: f64) -> SnapTarget {
    target(
        monitor,
        OverlayDockEdge::Right,
        OverlayFrame {
            height: 104.0,
            width: 32.0,
            x: monitor.x + monitor.width - 32.0,
            y,
        },
    )
}

#[test]
fn payload_is_monitor_local_and_pixel_snapped() {
    let painted = painted_preview(right_dock(SECOND_MONITOR, 219.6));

    assert_eq!(painted.monitor, SECOND_MONITOR);
    assert_eq!(painted.payload.anchor, OverlayDockEdge::Right);
    assert_eq!(painted.payload.x, 1888.0);
    assert_eq!(painted.payload.y, 400.0);
    assert_eq!(painted.payload.width, 32.0);
    assert_eq!(painted.payload.height, 104.0);
}

#[test]
fn first_sample_mounts_the_preview() {
    let painted = painted_preview(right_dock(MONITOR, 400.0));

    assert_eq!(preview_paint(None, painted), PreviewPaint::Mount);
}

#[test]
fn subpixel_pointer_travel_repaints_nothing() {
    let painted = painted_preview(right_dock(MONITOR, 400.1));
    let next = painted_preview(right_dock(MONITOR, 400.4));

    assert_eq!(preview_paint(Some(painted), next), PreviewPaint::Skip);
}

#[test]
fn sliding_along_the_same_edge_publishes_without_remounting() {
    let painted = painted_preview(right_dock(MONITOR, 400.0));
    let next = painted_preview(right_dock(MONITOR, 520.0));

    assert_eq!(preview_paint(Some(painted), next), PreviewPaint::Publish);
}

#[test]
fn a_new_edge_publishes_without_remounting() {
    let painted = painted_preview(right_dock(MONITOR, 400.0));
    let next = painted_preview(target(
        MONITOR,
        OverlayDockEdge::Top,
        OverlayFrame {
            height: 40.0,
            width: 128.0,
            x: 656.0,
            y: 0.0,
        },
    ));

    assert_eq!(preview_paint(Some(painted), next), PreviewPaint::Publish);
}

#[test]
fn crossing_screens_remounts_the_preview_over_the_new_monitor() {
    let painted = painted_preview(right_dock(MONITOR, 400.0));
    let next = painted_preview(right_dock(SECOND_MONITOR, 400.0));

    assert_eq!(preview_paint(Some(painted), next), PreviewPaint::Mount);
}
