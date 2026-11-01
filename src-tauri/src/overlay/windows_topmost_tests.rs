use super::{HUD_LABELS, RAISE_FLAGS};
use crate::overlay::window::{OVERLAY_NOTIFICATION_LABEL, RECORDING_OVERLAY_LABEL};
use windows::Win32::UI::WindowsAndMessaging::{
    SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER,
};

#[test]
fn raising_the_hud_never_steals_the_paste_target_focus() {
    assert!(RAISE_FLAGS.contains(SWP_NOACTIVATE));
}

#[test]
fn raising_the_hud_off_the_main_thread_never_waits_on_it() {
    assert!(RAISE_FLAGS.contains(SWP_ASYNCWINDOWPOS));
}

#[test]
fn raising_the_hud_keeps_its_docked_frame() {
    assert!(RAISE_FLAGS.contains(SWP_NOMOVE));
    assert!(RAISE_FLAGS.contains(SWP_NOSIZE));
    assert!(RAISE_FLAGS.contains(SWP_NOOWNERZORDER));
}

#[test]
fn raising_the_hud_actually_changes_its_z_order() {
    assert!(!RAISE_FLAGS.contains(SWP_NOZORDER));
}

#[test]
fn every_hud_surface_is_kept_on_top() {
    assert!(HUD_LABELS.contains(&RECORDING_OVERLAY_LABEL));
    assert!(HUD_LABELS.contains(&OVERLAY_NOTIFICATION_LABEL));
}
