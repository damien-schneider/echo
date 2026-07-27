use super::{
    overlay_surface, overlay_surface_payload, transition_window, MonitorBounds,
    OverlayNotchGeometry, OverlayPlacement, OverlayPresentation, RecordingOverlayMode,
    SurfaceRequest,
};
use crate::overlay::layout::{overlay_window_dimensions, OverlayFrame};
use crate::settings::{OverlayDockEdge, OverlayPosition};

const NOTCHED_MONITOR: MonitorBounds = MonitorBounds {
    height: 982.0,
    width: 1512.0,
    x: 0.0,
    y: 0.0,
};

const NOTCH: OverlayNotchGeometry = OverlayNotchGeometry {
    center_offset: 0.0,
    top_inset: 32.0,
    width: 196.0,
};

fn placement(position: OverlayPosition, dock_edge: OverlayDockEdge) -> OverlayPlacement {
    OverlayPlacement {
        dock_edge,
        dock_offset: 0.5,
        position,
    }
}

fn request(
    mode: RecordingOverlayMode,
    placement: OverlayPlacement,
    notch: Option<OverlayNotchGeometry>,
) -> SurfaceRequest {
    SurfaceRequest {
        mode,
        monitor: NOTCHED_MONITOR,
        notch,
        placement,
    }
}

#[test]
fn transient_surface_keeps_the_notch_strip_and_starts_below_it() {
    let placement = placement(OverlayPosition::Top, OverlayDockEdge::Top);
    let surface = overlay_surface(request(
        RecordingOverlayMode::Recording,
        placement,
        Some(NOTCH),
    ));

    let (width, height) = overlay_window_dimensions(RecordingOverlayMode::Recording, placement);
    assert_eq!(surface.window.y, NOTCHED_MONITOR.y);
    assert_eq!(surface.window.height, height + NOTCH.top_inset);
    assert_eq!(surface.island.y, NOTCHED_MONITOR.y + NOTCH.top_inset + 4.0);
    assert_eq!(surface.island.width, width - 8.0);
}

/// The notch strip is painted only when the island is wide enough to hide the cut-out.
#[test]
fn only_transient_top_surfaces_outgrow_the_notch_they_hang_from() {
    let top = placement(OverlayPosition::Top, OverlayDockEdge::Top);
    for mode in [
        RecordingOverlayMode::Recording,
        RecordingOverlayMode::Panel,
        RecordingOverlayMode::Chat,
    ] {
        let surface = overlay_surface(request(mode, top, Some(NOTCH)));
        assert!(surface.island.width >= NOTCH.width, "{mode:?}");
    }
    for mode in [RecordingOverlayMode::Compact, RecordingOverlayMode::Actions] {
        let surface = overlay_surface(request(mode, top, Some(NOTCH)));
        assert!(surface.island.width < NOTCH.width, "{mode:?}");
    }
}

#[test]
fn docked_top_resident_island_clears_the_notch() {
    let placement = placement(OverlayPosition::Edge, OverlayDockEdge::Top);
    let surface = overlay_surface(request(
        RecordingOverlayMode::Compact,
        placement,
        Some(NOTCH),
    ));

    assert_eq!(surface.island.y, NOTCHED_MONITOR.y + NOTCH.top_inset);
    assert_eq!((surface.island.width, surface.island.height), (38.0, 5.0));
    assert!(surface.island.y + surface.island.height <= surface.window.y + surface.window.height);
}

#[test]
fn notchless_screens_leave_top_surfaces_untouched() {
    let placement = placement(OverlayPosition::Top, OverlayDockEdge::Top);
    let surface = overlay_surface(request(RecordingOverlayMode::Recording, placement, None));

    let (_, height) = overlay_window_dimensions(RecordingOverlayMode::Recording, placement);
    assert_eq!(surface.window.height, height);
    assert_eq!(surface.island.y, NOTCHED_MONITOR.y + 4.0);
}

#[test]
fn bottom_surfaces_ignore_the_notch() {
    let placement = placement(OverlayPosition::Bottom, OverlayDockEdge::Bottom);
    let with_notch = overlay_surface(request(
        RecordingOverlayMode::Recording,
        placement,
        Some(NOTCH),
    ));
    let without_notch = overlay_surface(request(RecordingOverlayMode::Recording, placement, None));

    assert_eq!(with_notch, without_notch);
    assert_eq!(
        with_notch.island.y + with_notch.island.height,
        NOTCHED_MONITOR.y + NOTCHED_MONITOR.height - 4.0
    );
}

#[test]
fn side_docked_resident_hugs_the_screen_edge_at_one_fixed_size() {
    let placement = placement(OverlayPosition::Edge, OverlayDockEdge::Right);
    let compact = overlay_surface(request(RecordingOverlayMode::Compact, placement, None));
    let actions = overlay_surface(request(RecordingOverlayMode::Actions, placement, None));

    let screen_right = NOTCHED_MONITOR.x + NOTCHED_MONITOR.width;
    assert_eq!((compact.island.width, compact.island.height), (32.0, 104.0));
    assert_eq!(compact.island.x + compact.island.width, screen_right);
    assert_eq!(compact.island, actions.island);
}

#[test]
fn transient_placement_recenters_on_an_offset_notch() {
    let offset_notch = OverlayNotchGeometry {
        center_offset: 8.0,
        ..NOTCH
    };
    let centered = overlay_surface(request(
        RecordingOverlayMode::Recording,
        placement(OverlayPosition::Top, OverlayDockEdge::Top),
        Some(offset_notch),
    ));
    let docked = overlay_surface(request(
        RecordingOverlayMode::Compact,
        placement(OverlayPosition::Edge, OverlayDockEdge::Top),
        Some(offset_notch),
    ));
    let docked_without_notch = overlay_surface(request(
        RecordingOverlayMode::Compact,
        placement(OverlayPosition::Edge, OverlayDockEdge::Top),
        None,
    ));

    let unshifted = overlay_surface(request(
        RecordingOverlayMode::Recording,
        placement(OverlayPosition::Top, OverlayDockEdge::Top),
        Some(NOTCH),
    ));
    assert_eq!(centered.window.x, unshifted.window.x + 8.0);
    assert_eq!(docked.window.x, docked_without_notch.window.x);
}

#[test]
fn surfaces_never_leave_the_monitor() {
    for position in [
        OverlayPosition::Top,
        OverlayPosition::Bottom,
        OverlayPosition::Edge,
    ] {
        for edge in [
            OverlayDockEdge::Left,
            OverlayDockEdge::Right,
            OverlayDockEdge::Top,
            OverlayDockEdge::Bottom,
        ] {
            for mode in [
                RecordingOverlayMode::Compact,
                RecordingOverlayMode::Actions,
                RecordingOverlayMode::Recording,
                RecordingOverlayMode::Panel,
                RecordingOverlayMode::Chat,
            ] {
                let surface = overlay_surface(request(
                    mode,
                    placement(position, edge),
                    Some(OverlayNotchGeometry {
                        center_offset: 120.0,
                        ..NOTCH
                    }),
                ));
                assert!(surface.window.x >= NOTCHED_MONITOR.x);
                assert!(
                    surface.window.x + surface.window.width
                        <= NOTCHED_MONITOR.x + NOTCHED_MONITOR.width
                );
                assert!(surface.island.x >= surface.window.x);
                assert!(surface.island.y >= surface.window.y);
            }
        }
    }
}

#[test]
fn transition_window_covers_both_surfaces_without_leaving_the_monitor() {
    let docked = overlay_surface(request(
        RecordingOverlayMode::Compact,
        placement(OverlayPosition::Edge, OverlayDockEdge::Right),
        None,
    ));
    let transient = overlay_surface(request(
        RecordingOverlayMode::Chat,
        placement(OverlayPosition::Top, OverlayDockEdge::Top),
        None,
    ));

    let union = transition_window(NOTCHED_MONITOR, [docked.window], transient.window);

    for frame in [docked.window, transient.window] {
        assert!(union.x <= frame.x);
        assert!(union.y <= frame.y);
        assert!(union.x + union.width >= frame.x + frame.width);
        assert!(union.y + union.height >= frame.y + frame.height);
    }
    assert!(union.x >= NOTCHED_MONITOR.x);
    assert!(union.x + union.width <= NOTCHED_MONITOR.x + NOTCHED_MONITOR.width);
}

#[test]
fn transition_window_of_one_frame_is_that_frame() {
    let target = OverlayFrame {
        height: 96.0,
        width: 334.0,
        x: 589.0,
        y: 0.0,
    };

    assert_eq!(transition_window(NOTCHED_MONITOR, [], target), target);
}

#[test]
fn payload_reports_window_local_geometry_and_screen_origin() {
    let placement = placement(OverlayPosition::Top, OverlayDockEdge::Top);
    let surface = overlay_surface(request(
        RecordingOverlayMode::Recording,
        placement,
        Some(NOTCH),
    ));
    let window = transition_window(NOTCHED_MONITOR, [], surface.window);

    let payload = overlay_surface_payload(
        request(RecordingOverlayMode::Recording, placement, Some(NOTCH)),
        window,
    )
    .expect("visible placement has a payload");

    assert_eq!(payload.anchor, OverlayDockEdge::Top);
    assert_eq!(payload.presentation, OverlayPresentation::Bar);
    assert_eq!(payload.island.x, surface.island.x - window.x);
    assert_eq!(payload.island.y, NOTCH.top_inset + 4.0);
    assert_eq!(payload.window.x, window.x);
    let notch = payload.notch.expect("notched screen reports a notch box");
    assert_eq!(notch.width, NOTCH.width);
    assert_eq!(notch.height, NOTCH.top_inset);
    assert_eq!(
        notch.x + notch.width / 2.0 + window.x,
        NOTCHED_MONITOR.x + NOTCHED_MONITOR.width / 2.0
    );
}

#[test]
fn island_stays_put_when_only_the_window_grows_for_a_transition() {
    let docked = placement(OverlayPosition::Edge, OverlayDockEdge::Right);
    let surface = overlay_surface(request(RecordingOverlayMode::Compact, docked, None));
    let transient = overlay_surface(request(
        RecordingOverlayMode::Chat,
        placement(OverlayPosition::Top, OverlayDockEdge::Top),
        None,
    ));
    let union = transition_window(NOTCHED_MONITOR, [transient.window], surface.window);

    let compact = request(RecordingOverlayMode::Compact, docked, None);
    let settled =
        overlay_surface_payload(compact, surface.window).expect("docked placement has a payload");
    let during_transition =
        overlay_surface_payload(compact, union).expect("docked placement has a payload");

    assert_eq!(
        settled.island.x + settled.window.x,
        during_transition.island.x + during_transition.window.x
    );
    assert_eq!(
        settled.island.y + settled.window.y,
        during_transition.island.y + during_transition.window.y
    );
}

#[test]
fn hover_box_tracks_the_drawn_island_for_residents() {
    let docked = placement(OverlayPosition::Edge, OverlayDockEdge::Right);
    let compact = request(RecordingOverlayMode::Compact, docked, None);
    let surface = overlay_surface(compact);

    let hover = super::surface_hover_box(compact, surface.window);

    assert_eq!((hover.width, hover.height), (32.0, 104.0));
    assert_eq!(hover.x + hover.width, surface.window.width);
}

#[test]
fn hover_box_covers_the_whole_canvas_for_transient_surfaces() {
    let top = placement(OverlayPosition::Top, OverlayDockEdge::Top);
    let chat = request(RecordingOverlayMode::Chat, top, None);
    let surface = overlay_surface(chat);

    let hover = super::surface_hover_box(chat, surface.window);

    assert_eq!((hover.x, hover.y), (0.0, 0.0));
    assert_eq!(
        (hover.width, hover.height),
        (surface.window.width, surface.window.height)
    );
}

#[test]
fn disabled_placement_has_no_payload() {
    let hidden = placement(OverlayPosition::None, OverlayDockEdge::Top);
    let surface = overlay_surface(request(RecordingOverlayMode::Compact, hidden, None));

    assert!(overlay_surface_payload(
        request(RecordingOverlayMode::Compact, hidden, None),
        surface.window
    )
    .is_none());
}
