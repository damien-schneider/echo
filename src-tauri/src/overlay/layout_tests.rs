use super::*;

const MONITOR: MonitorBounds = MonitorBounds {
    x: 0.0,
    y: 0.0,
    width: 1920.0,
    height: 1080.0,
};

fn placement(
    position: OverlayPosition,
    dock_edge: OverlayDockEdge,
    dock_offset: f64,
) -> OverlayPlacement {
    OverlayPlacement {
        position,
        dock_edge,
        dock_offset,
    }
}

fn edge_placement(dock_edge: OverlayDockEdge, dock_offset: f64) -> OverlayPlacement {
    placement(OverlayPosition::Edge, dock_edge, dock_offset)
}

fn assert_inside(monitor: MonitorBounds, frame: (f64, f64, f64, f64)) {
    let (x, y, width, height) = frame;
    assert!(x >= monitor.x);
    assert!(y >= monitor.y);
    assert!(x + width <= monitor.x + monitor.width);
    assert!(y + height <= monitor.y + monitor.height);
}

#[test]
fn interaction_dimensions_preserve_mode_sizes() {
    assert_eq!(
        overlay_interaction_dimensions(RecordingOverlayMode::Compact),
        (64.0, 28.0)
    );
    assert_eq!(
        overlay_interaction_dimensions(RecordingOverlayMode::Chat),
        (CHAT_OVERLAY_WIDTH, CHAT_OVERLAY_HEIGHT)
    );
}

#[cfg(target_os = "macos")]
#[test]
fn side_resident_modes_share_a_vertical_actions_window() {
    let placement = edge_placement(OverlayDockEdge::Right, 0.5);
    assert_eq!(
        overlay_window_dimensions(RecordingOverlayMode::Compact, placement),
        (48.0, 136.0)
    );
    assert_eq!(
        overlay_window_dimensions(RecordingOverlayMode::Actions, placement),
        (48.0, 136.0)
    );
}

#[cfg(not(target_os = "macos"))]
#[test]
fn side_compact_window_contains_the_vertical_actions() {
    assert_eq!(
        overlay_window_dimensions(
            RecordingOverlayMode::Compact,
            edge_placement(OverlayDockEdge::Right, 0.5)
        ),
        (48.0, 136.0)
    );
    assert_eq!(
        overlay_window_dimensions(
            RecordingOverlayMode::Compact,
            edge_placement(OverlayDockEdge::Top, 0.5)
        ),
        (64.0, 28.0)
    );
}

#[test]
fn wayland_anchor_honors_all_resolved_edges() {
    assert_eq!(
        wayland_anchor_edges(edge_placement(OverlayDockEdge::Right, 0.5)),
        (false, false, false, true)
    );
    assert_eq!(
        wayland_anchor_edges(edge_placement(OverlayDockEdge::Left, 0.5)),
        (false, false, true, false)
    );
    assert_eq!(
        wayland_anchor_edges(edge_placement(OverlayDockEdge::Bottom, 0.5)),
        (false, true, false, false)
    );
    assert_eq!(
        wayland_anchor_edges(edge_placement(OverlayDockEdge::Top, 0.5)),
        (true, false, false, false)
    );
}

#[test]
fn explicit_disabled_position_keeps_resident_window_hidden() {
    assert!(!overlay_initially_visible(OverlayPosition::None));
    assert!(overlay_initially_visible(OverlayPosition::Edge));
    assert!(overlay_initially_visible(OverlayPosition::Top));
    assert!(overlay_initially_visible(OverlayPosition::Bottom));
}

#[test]
fn only_chat_can_accept_keyboard_focus() {
    assert!(!overlay_mode_accepts_keyboard(
        RecordingOverlayMode::Compact
    ));
    assert!(!overlay_mode_accepts_keyboard(
        RecordingOverlayMode::Actions
    ));
    assert!(!overlay_mode_accepts_keyboard(
        RecordingOverlayMode::Recording
    ));
    assert!(!overlay_mode_accepts_keyboard(RecordingOverlayMode::Panel));
    assert!(overlay_mode_accepts_keyboard(RecordingOverlayMode::Chat));
}

#[test]
fn resolved_anchor_maps_every_position_to_one_edge() {
    assert_eq!(
        edge_placement(OverlayDockEdge::Left, 0.25).resolved_anchor(),
        OverlayDockEdge::Left
    );
    assert_eq!(
        placement(OverlayPosition::Top, OverlayDockEdge::Right, 0.75).resolved_anchor(),
        OverlayDockEdge::Top
    );
    assert_eq!(
        placement(OverlayPosition::Bottom, OverlayDockEdge::Left, 0.25).resolved_anchor(),
        OverlayDockEdge::Bottom
    );
    assert_eq!(
        placement(OverlayPosition::None, OverlayDockEdge::Right, 0.5).resolved_anchor(),
        OverlayDockEdge::Top
    );
}

#[test]
fn default_geometry_is_right_centered() {
    let (x, y, width, height) = compute_overlay_geometry(
        MONITOR,
        edge_placement(OverlayDockEdge::Right, 0.5),
        RecordingOverlayMode::Compact,
    );
    assert_eq!(x, MONITOR.width - width);
    assert_eq!(y, (MONITOR.height - height) / 2.0);
}

#[test]
fn every_edge_clamps_zero_center_and_one_offsets() {
    for edge in [
        OverlayDockEdge::Left,
        OverlayDockEdge::Right,
        OverlayDockEdge::Top,
        OverlayDockEdge::Bottom,
    ] {
        for offset in [0.0, 0.5, 1.0] {
            let frame = compute_overlay_geometry(
                MONITOR,
                edge_placement(edge, offset),
                RecordingOverlayMode::Recording,
            );
            assert_inside(MONITOR, frame);
            let (x, y, width, height) = frame;
            match edge {
                OverlayDockEdge::Left => assert_eq!(x, MONITOR.x),
                OverlayDockEdge::Right => {
                    assert_eq!(x + width, MONITOR.x + MONITOR.width)
                }
                OverlayDockEdge::Top => assert_eq!(y, MONITOR.y),
                OverlayDockEdge::Bottom => {
                    assert_eq!(y + height, MONITOR.y + MONITOR.height)
                }
            }
        }
    }
}

#[test]
fn every_native_mode_stays_inside_negative_coordinate_monitor() {
    let monitor = MonitorBounds {
        x: -2560.0,
        y: -320.0,
        width: 2560.0,
        height: 1440.0,
    };
    for mode in [
        RecordingOverlayMode::Compact,
        RecordingOverlayMode::Actions,
        RecordingOverlayMode::Recording,
        RecordingOverlayMode::Panel,
        RecordingOverlayMode::Chat,
    ] {
        for edge in [
            OverlayDockEdge::Left,
            OverlayDockEdge::Right,
            OverlayDockEdge::Top,
            OverlayDockEdge::Bottom,
        ] {
            for offset in [0.0, 0.5, 1.0] {
                assert_inside(
                    monitor,
                    compute_overlay_geometry(monitor, edge_placement(edge, offset), mode),
                );
            }
        }
    }
}

#[test]
fn nearest_edge_uses_deterministic_tie_order() {
    let square = MonitorBounds {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    };
    assert_eq!(
        dock_location_from_frame(
            square,
            OverlayFrame {
                x: 50.0,
                y: 50.0,
                width: 0.0,
                height: 0.0,
            }
        ),
        (OverlayDockEdge::Right, 0.5)
    );
    assert_eq!(
        dock_location_from_frame(
            square,
            OverlayFrame {
                x: 0.0,
                y: 20.0,
                width: 10.0,
                height: 20.0,
            }
        ),
        (OverlayDockEdge::Left, 0.3)
    );
    assert_eq!(
        dock_location_from_frame(
            square,
            OverlayFrame {
                x: 70.0,
                y: 90.0,
                width: 20.0,
                height: 10.0,
            }
        ),
        (OverlayDockEdge::Bottom, 0.8)
    );
}

#[test]
fn preferred_edge_prevents_corner_flicker_until_the_next_edge_is_clear() {
    let square = MonitorBounds {
        x: 0.0,
        y: 0.0,
        width: 100.0,
        height: 100.0,
    };
    let near_bottom_right = OverlayFrame {
        x: 78.0,
        y: 80.0,
        width: 10.0,
        height: 10.0,
    };
    assert_eq!(
        dock_location_from_frame(square, near_bottom_right).0,
        OverlayDockEdge::Bottom
    );
    assert_eq!(
        dock_location_from_frame_with_hysteresis(
            square,
            near_bottom_right,
            Some(OverlayDockEdge::Right),
            10.0,
        )
        .0,
        OverlayDockEdge::Right
    );

    let clearly_bottom = OverlayFrame {
        x: 70.0,
        y: 94.0,
        width: 10.0,
        height: 10.0,
    };
    assert_eq!(
        dock_location_from_frame_with_hysteresis(
            square,
            clearly_bottom,
            Some(OverlayDockEdge::Right),
            10.0,
        )
        .0,
        OverlayDockEdge::Bottom
    );
}

#[test]
fn nearest_edge_offset_is_clamped_for_offscreen_frames() {
    let (edge, offset) = dock_location_from_frame(
        MONITOR,
        OverlayFrame {
            x: MONITOR.width,
            y: -500.0,
            width: 100.0,
            height: 100.0,
        },
    );
    assert_eq!(edge, OverlayDockEdge::Right);
    assert_eq!(offset, 0.0);
}

#[test]
fn legacy_top_bottom_and_none_geometry_is_unchanged() {
    let width = overlay_interaction_dimensions(RecordingOverlayMode::Recording).0;
    let expected_x = (MONITOR.width - width) / 2.0;
    let top = compute_overlay_geometry(
        MONITOR,
        placement(OverlayPosition::Top, OverlayDockEdge::Left, 0.0),
        RecordingOverlayMode::Recording,
    );
    let bottom = compute_overlay_geometry(
        MONITOR,
        placement(OverlayPosition::Bottom, OverlayDockEdge::Right, 1.0),
        RecordingOverlayMode::Recording,
    );
    let none = compute_overlay_geometry(
        MONITOR,
        placement(OverlayPosition::None, OverlayDockEdge::Bottom, 0.5),
        RecordingOverlayMode::Recording,
    );
    assert_eq!(top.0, expected_x);
    assert_eq!(top.1, MONITOR.y);
    assert_eq!(bottom.0, expected_x);
    assert_eq!(bottom.1 + bottom.3, MONITOR.y + MONITOR.height);
    assert_eq!(none, top);
}

#[test]
fn each_window_only_parses_the_modes_it_owns() {
    assert_eq!(parse_hud_mode("compact"), Ok(RecordingOverlayMode::Compact));
    assert_eq!(parse_hud_mode("actions"), Ok(RecordingOverlayMode::Actions));
    assert_eq!(
        parse_notification_mode("recording"),
        Ok(RecordingOverlayMode::Recording)
    );
    assert_eq!(
        parse_notification_mode("chat"),
        Ok(RecordingOverlayMode::Chat)
    );
    assert!(parse_hud_mode("recording").is_err());
    assert!(parse_notification_mode("compact").is_err());
    assert_eq!(
        parse_hud_mode("orbit"),
        Err("Unknown overlay mode: orbit".to_string())
    );
}

#[test]
fn only_a_top_anchored_hud_stands_down_for_the_notification() {
    let yielding = [
        placement(OverlayPosition::Top, OverlayDockEdge::Bottom, 0.5),
        edge_placement(OverlayDockEdge::Top, 0.5),
    ];
    let standing = [
        edge_placement(OverlayDockEdge::Right, 0.5),
        placement(OverlayPosition::Bottom, OverlayDockEdge::Top, 0.5),
    ];

    assert!(yielding.into_iter().all(hud_yields_to_notification));
    assert!(!standing.into_iter().any(hud_yields_to_notification));
}

#[test]
fn panel_and_chat_dimensions_remain_available() {
    let panel = parse_notification_mode("panel").expect("panel mode should parse");
    assert_eq!(
        overlay_interaction_dimensions(panel),
        (PANEL_OVERLAY_WIDTH, PANEL_OVERLAY_HEIGHT)
    );
    let (_, _, width, height) = compute_overlay_geometry(
        MONITOR,
        edge_placement(OverlayDockEdge::Right, 0.5),
        RecordingOverlayMode::Chat,
    );
    assert_eq!((width, height), (CHAT_OVERLAY_WIDTH, CHAT_OVERLAY_HEIGHT));
}

/// Only Rust opens it, and it never types — so it must not take the keyboard out from under the caret.
#[test]
fn the_transcript_surface_belongs_to_the_notification_and_stays_keyboard_free() {
    assert_eq!(
        parse_notification_mode("transcript"),
        Ok(RecordingOverlayMode::Transcript)
    );
    assert!(parse_hud_mode("transcript").is_err());
    assert!(!overlay_mode_accepts_keyboard(
        RecordingOverlayMode::Transcript
    ));
    assert!(!overlay_mode_is_resident(RecordingOverlayMode::Transcript));
}
