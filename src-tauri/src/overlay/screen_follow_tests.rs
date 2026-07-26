use super::{follow_step, pointer_is_on_screen, FollowStep, SCREEN_FOLLOW_DWELL};
use std::time::Duration;

const SCREEN: (f64, f64, f64, f64) = (0.0, 0.0, 1440.0, 900.0);

#[test]
fn pointer_on_the_island_screen_leaves_the_dwell_alone() {
    assert_eq!(follow_step(false, None), FollowStep::Hold);
}

#[test]
fn pointer_coming_back_drops_the_dwell() {
    assert_eq!(
        follow_step(false, Some(Duration::from_millis(900))),
        FollowStep::Disarm
    );
}

#[test]
fn first_sample_on_another_screen_starts_the_dwell() {
    assert_eq!(follow_step(true, None), FollowStep::Arm);
}

#[test]
fn overshooting_a_pixel_never_moves_the_island() {
    assert_eq!(
        follow_step(true, Some(SCREEN_FOLLOW_DWELL - Duration::from_millis(1))),
        FollowStep::Hold
    );
}

#[test]
fn a_settled_pointer_moves_the_island() {
    assert_eq!(
        follow_step(true, Some(SCREEN_FOLLOW_DWELL)),
        FollowStep::Move
    );
    assert_eq!(
        follow_step(true, Some(SCREEN_FOLLOW_DWELL * 3)),
        FollowStep::Move
    );
}

#[test]
fn the_dwell_lasts_two_seconds() {
    assert_eq!(SCREEN_FOLLOW_DWELL, Duration::from_secs(2));
}

#[test]
fn only_one_screen_owns_the_seam_between_two_displays() {
    assert!(pointer_is_on_screen(SCREEN, (0.0, 0.0)));
    assert!(pointer_is_on_screen(SCREEN, (1439.5, 899.5)));
    assert!(!pointer_is_on_screen(SCREEN, (1440.0, 400.0)));
    assert!(!pointer_is_on_screen(SCREEN, (700.0, 900.0)));
    assert!(!pointer_is_on_screen(SCREEN, (-1.0, 400.0)));
}
