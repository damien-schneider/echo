use super::{
    hover_pointer_inside, hover_region_in_screen, overlay_hover_region_for_pointer,
    window_local_pointer,
};
use crate::overlay::layout::{OverlaySurfaceKind, RecordingOverlayMode};
use crate::overlay::surface::OverlayBoxPayload;

const FRAME: (f64, f64, f64, f64) = (100.0, 200.0, 136.0, 48.0);

fn island(x: f64, y: f64, width: f64, height: f64) -> OverlayBoxPayload {
    OverlayBoxPayload {
        height,
        width,
        x,
        y,
    }
}

#[test]
fn window_local_island_maps_onto_the_appkit_frame() {
    let region = hover_region_in_screen(FRAME, island(49.0, 4.0, 38.0, 5.0));

    assert_eq!(region, (149.0, 239.0, 38.0, 5.0));
}

#[test]
fn island_touching_the_window_bottom_touches_the_appkit_frame_origin() {
    let region = hover_region_in_screen(FRAME, island(4.0, 43.0, 128.0, 5.0));

    assert_eq!(region, (104.0, 200.0, 128.0, 5.0));
}

#[test]
fn hover_region_follows_the_one_drawn_island() {
    let drawn = island(16.0, 12.0, 32.0, 104.0);

    assert_eq!(
        overlay_hover_region_for_pointer(FRAME, true, Some(drawn)),
        Some(hover_region_in_screen(FRAME, drawn))
    );
}

#[test]
fn hidden_or_unconfigured_panels_have_no_hover_region() {
    let drawn = island(49.0, 4.0, 38.0, 5.0);

    assert_eq!(
        overlay_hover_region_for_pointer(FRAME, false, Some(drawn)),
        None
    );
    assert_eq!(overlay_hover_region_for_pointer(FRAME, true, None), None);
}

#[test]
fn transparent_resident_canvas_margin_rejects_entry() {
    let region = hover_region_in_screen(FRAME, island(49.0, 39.0, 38.0, 5.0));

    assert!(hover_pointer_inside(region, (158.0, 204.0), false));
    assert!(!hover_pointer_inside(region, (110.0, 206.0), false));
}

#[test]
fn expanded_region_retains_pointer_through_two_pixel_exit_margin() {
    let region = hover_region_in_screen(FRAME, island(4.0, 4.0, 128.0, 40.0));

    assert!(hover_pointer_inside(region, (102.0, 220.0), true));
    assert!(!hover_pointer_inside(region, (101.9, 220.0), true));
}

#[test]
fn hover_entry_requires_the_pointer_strictly_inside_the_frame() {
    let frame = (100.0, 100.0, 64.0, 28.0);

    assert!(hover_pointer_inside(frame, (100.0, 100.0), false));
    assert!(hover_pointer_inside(frame, (163.9, 127.9), false));
    assert!(!hover_pointer_inside(frame, (99.0, 100.0), false));
    assert!(!hover_pointer_inside(frame, (164.0, 100.0), false));

    assert!(hover_pointer_inside(frame, (98.0, 100.0), true));
    assert!(!hover_pointer_inside(frame, (97.9, 100.0), true));
}

/// Hovering never earns the keyboard — only a surface the user types into does.
#[test]
fn only_a_typing_surface_may_take_the_keyboard() {
    use std::sync::atomic::Ordering;

    let hud = super::panel_hover_state(OverlaySurfaceKind::Hud);
    let notification = super::panel_hover_state(OverlaySurfaceKind::Notification);

    assert!(!hud.can_become_key_window());
    notification.set_key_policy(RecordingOverlayMode::Chat);
    assert!(notification.can_become_key_window());
    assert!(!hud.can_become_key_window());

    super::SYNTHETIC_KEY_SUPPRESSED.store(true, Ordering::Release);
    assert!(!notification.can_become_key_window());
    super::SYNTHETIC_KEY_SUPPRESSED.store(false, Ordering::Release);
    assert!(notification.can_become_key_window());

    notification.set_key_policy(RecordingOverlayMode::Recording);
    assert!(!notification.can_become_key_window());
}

#[test]
fn window_local_pointer_flips_onto_the_webview_axis() {
    assert_eq!(window_local_pointer(FRAME, (149.0, 239.0)), (49.0, 9.0));
    assert_eq!(window_local_pointer(FRAME, (100.0, 248.0)), (0.0, 0.0));
}

#[test]
fn each_panel_answers_for_its_own_window_label() {
    let hud = super::panel_hover_state_for_label("recording_overlay").expect("hud panel");
    let notification =
        super::panel_hover_state_for_label("overlay_notification").expect("notification panel");

    assert_eq!(hud.label(), "recording_overlay");
    assert_eq!(notification.label(), "overlay_notification");
    assert!(super::panel_hover_state_for_label("snap_preview").is_err());
}
