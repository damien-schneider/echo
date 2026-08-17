use super::RecordingOverlayMode;

#[test]
fn each_surface_publishes_on_its_own_window_and_channel() {
    use super::{surface_event_name, surface_window_label, OverlaySurfaceKind};

    assert_eq!(
        surface_window_label(OverlaySurfaceKind::Hud),
        "recording_overlay"
    );
    assert_eq!(
        surface_window_label(OverlaySurfaceKind::Notification),
        "overlay_notification"
    );
    assert_ne!(
        surface_event_name(OverlaySurfaceKind::Hud),
        surface_event_name(OverlaySurfaceKind::Notification)
    );
}

#[test]
fn surface_recovery_preserves_last_payload_per_window() {
    use crate::{
        overlay::{
            layout::{OverlayPresentation, OverlaySurfaceKind},
            surface::{OverlayBoxPayload, OverlayOriginPayload, OverlaySurfacePayload},
        },
        settings::OverlayDockEdge,
    };

    let payload = |x| OverlaySurfacePayload {
        anchor: OverlayDockEdge::Top,
        island: OverlayBoxPayload {
            height: 100.0,
            width: 200.0,
            x,
            y: 32.0,
        },
        notch: None,
        presentation: OverlayPresentation::Bar,
        window: OverlayOriginPayload { x, y: 0.0 },
    };
    let hud = payload(10.0);
    let notification = payload(20.0);
    let mut surfaces = super::SurfacePayloads {
        hud: None,
        notification: None,
    };

    surfaces.replace(OverlaySurfaceKind::Hud, Some(hud));
    surfaces.replace(OverlaySurfaceKind::Notification, Some(notification));

    assert_eq!(surfaces.current(OverlaySurfaceKind::Hud), Some(hud));
    assert_eq!(
        surfaces.current(OverlaySurfaceKind::Notification),
        Some(notification)
    );
}

/// A window missing from the capability file gets no IPC — `listen` is denied and the webview drops.
#[test]
fn every_overlay_webview_is_granted_ipc() {
    let capabilities = include_str!("../../capabilities/default.json");

    for label in [
        super::RECORDING_OVERLAY_LABEL,
        super::OVERLAY_NOTIFICATION_LABEL,
        crate::overlay::snap::SNAP_PREVIEW_LABEL,
    ] {
        assert!(
            capabilities.contains(&format!("\"{label}\"")),
            "{label} is missing from capabilities/default.json"
        );
    }
}

#[test]
fn transient_surface_placement_uses_top_center_notch() {
    use crate::{
        overlay::layout::{overlay_placement_for_mode, OverlayPlacement},
        settings::{OverlayDockEdge, OverlayPosition},
    };

    let resident = OverlayPlacement {
        dock_edge: OverlayDockEdge::Right,
        dock_offset: 0.5,
        position: OverlayPosition::Edge,
    };
    let notch = OverlayPlacement {
        dock_edge: OverlayDockEdge::Top,
        dock_offset: 0.5,
        position: OverlayPosition::Top,
    };
    for mode in [
        RecordingOverlayMode::Recording,
        RecordingOverlayMode::Panel,
        RecordingOverlayMode::Chat,
    ] {
        assert_eq!(overlay_placement_for_mode(resident, mode), notch);
    }
    assert_eq!(
        overlay_placement_for_mode(resident, RecordingOverlayMode::Compact),
        resident
    );
}

#[test]
fn frame_operations_move_before_growth_and_resize_before_shrink() {
    use super::{FrameOperation, OverlayFrame};

    let growing = OverlayFrame {
        height: 620.0,
        width: 680.0,
        x: 10.0,
        y: 20.0,
    };
    assert_eq!(
        super::frame_operation_order((154.0, 48.0), growing),
        [FrameOperation::Move, FrameOperation::Resize]
    );

    let shrinking = OverlayFrame {
        height: 48.0,
        width: 154.0,
        ..growing
    };
    assert_eq!(
        super::frame_operation_order((680.0, 620.0), shrinking),
        [FrameOperation::Resize, FrameOperation::Move]
    );
}

#[test]
fn repeated_snap_completion_is_idempotent() {
    use crate::{
        overlay::layout::{
            compute_overlay_geometry, dock_location_from_frame, MonitorBounds, OverlayFrame,
            OverlayPlacement,
        },
        settings::OverlayPosition,
    };

    let monitor = MonitorBounds {
        height: 800.0,
        width: 1000.0,
        x: 0.0,
        y: 0.0,
    };
    let (edge, offset) = dock_location_from_frame(
        monitor,
        OverlayFrame {
            height: 60.0,
            width: 100.0,
            x: 890.0,
            y: 390.0,
        },
    );
    let placement = OverlayPlacement {
        dock_edge: edge,
        dock_offset: offset,
        position: OverlayPosition::Edge,
    };
    let (x, y, width, height) =
        compute_overlay_geometry(monitor, placement, RecordingOverlayMode::Actions);

    assert_eq!(
        dock_location_from_frame(
            monitor,
            OverlayFrame {
                height,
                width,
                x,
                y,
            }
        ),
        (edge, offset)
    );
}
