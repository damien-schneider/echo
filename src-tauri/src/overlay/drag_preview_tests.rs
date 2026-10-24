use super::{grab_offset, held_island, painted_preview, preview_paint, PreviewPaint, SnapTarget};
use crate::overlay::layout::{
    compute_overlay_geometry_for_size, dock_location_from_frame, MonitorBounds, OverlayFrame,
    OverlayPlacement,
};
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

#[test]
fn a_grip_held_near_the_end_previews_the_dock_level_with_the_island() {
    let docked = OverlayFrame {
        height: 236.0,
        width: 48.0,
        x: 1392.0,
        y: 332.0,
    };
    let grip = OverlayFrame {
        height: 0.0,
        width: 0.0,
        x: 1416.0,
        y: 360.0,
    };
    let grab = grab_offset(docked, grip);
    // pulled straight off the edge: the island keeps its height, the pointer stays at the grip
    let pulled = OverlayFrame { x: 1180.0, ..grip };

    let (dock_edge, dock_offset) = dock_location_from_frame(MONITOR, held_island(pulled, grab));
    let placement = OverlayPlacement {
        dock_edge,
        dock_offset,
        position: OverlayPosition::Edge,
    };
    let (_, preview_y, _, preview_height) =
        compute_overlay_geometry_for_size(MONITOR, placement, docked.width, docked.height);

    assert_eq!(dock_edge, OverlayDockEdge::Right);
    assert_eq!(
        preview_y + preview_height / 2.0,
        docked.y + docked.height / 2.0
    );
}
