use super::{docked, notification, request, NOTCH};
use crate::overlay::surface::{overlay_surface, surface_hover_box, RecordingOverlayMode};
use crate::settings::OverlayDockEdge;

#[test]
fn hover_box_tracks_the_drawn_island_for_residents() {
    let compact = request(
        RecordingOverlayMode::Compact,
        docked(OverlayDockEdge::Right),
        None,
    );
    let surface = overlay_surface(compact);

    let hover = surface_hover_box(compact, surface.window);

    assert_eq!((hover.width, hover.height), (40.0, 228.0));
    assert_eq!(hover.x + hover.width, surface.window.width);
}

#[test]
fn hover_box_reaches_the_screen_edge_under_a_floating_dock() {
    for (edge, notch) in [
        (OverlayDockEdge::Bottom, None),
        (OverlayDockEdge::Top, Some(NOTCH)),
    ] {
        let compact = request(RecordingOverlayMode::Compact, docked(edge), notch);
        let surface = overlay_surface(compact);
        let island_top = surface.island.y - surface.window.y;

        let hover = surface_hover_box(compact, surface.window);

        assert_eq!(hover.x, surface.island.x - surface.window.x, "{edge:?}");
        assert_eq!(hover.width, 38.0, "{edge:?}");
        if edge == OverlayDockEdge::Bottom {
            assert_eq!(hover.y, island_top);
            assert_eq!(hover.y + hover.height, surface.window.height);
        } else {
            assert_eq!(hover.y, 0.0);
            assert_eq!(hover.height, island_top + 5.0);
        }
    }
}

#[test]
fn hover_box_covers_the_whole_canvas_for_transient_surfaces() {
    let chat = request(RecordingOverlayMode::Chat, notification(), None);
    let surface = overlay_surface(chat);

    let hover = surface_hover_box(chat, surface.window);

    assert_eq!((hover.x, hover.y), (0.0, 0.0));
    assert_eq!(
        (hover.width, hover.height),
        (surface.window.width, surface.window.height)
    );
}
