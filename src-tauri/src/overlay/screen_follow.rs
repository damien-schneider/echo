use super::window::RECORDING_OVERLAY_LABEL;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const SCREEN_HANDOFF_EVENT: &str = "overlay-screen-handoff";
/// Reaching for the island can overshoot onto the next display — the pointer must settle before it follows.
pub(super) const SCREEN_FOLLOW_DWELL: Duration = Duration::from_secs(2);

static DWELL_SINCE: Mutex<Option<Instant>> = Mutex::new(None);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum FollowStep {
    Arm,
    Disarm,
    Hold,
    Move,
}

pub(super) fn follow_step(pointer_is_away: bool, dwell: Option<Duration>) -> FollowStep {
    match (pointer_is_away, dwell) {
        (false, None) => FollowStep::Hold,
        (false, Some(_)) => FollowStep::Disarm,
        (true, None) => FollowStep::Arm,
        (true, Some(waited)) if waited >= SCREEN_FOLLOW_DWELL => FollowStep::Move,
        (true, Some(_)) => FollowStep::Hold,
    }
}

/// Upper bounds stay exclusive: two adjacent screens must not both own the seam.
pub(super) fn pointer_is_on_screen(frame: (f64, f64, f64, f64), pointer: (f64, f64)) -> bool {
    let (x, y, width, height) = frame;
    pointer.0 >= x && pointer.0 < x + width && pointer.1 >= y && pointer.1 < y + height
}

fn replace_dwell(next: Option<Instant>) {
    match DWELL_SINCE.lock() {
        Ok(mut dwell) => *dwell = next,
        Err(poisoned) => *poisoned.into_inner() = next,
    }
}

pub(super) fn dwell() -> Option<Duration> {
    match DWELL_SINCE.lock() {
        Ok(dwell) => *dwell,
        Err(poisoned) => **poisoned.get_ref(),
    }
    .map(|since| since.elapsed())
}

pub(super) fn arm() {
    replace_dwell(Some(Instant::now()));
}

pub(super) fn disarm() {
    replace_dwell(None);
}

/// The webview fades out before asking for the move — a mid-animation teleport reads as a flicker.
pub(super) fn request_handoff(app_handle: &AppHandle) {
    let _ = app_handle.emit_to(RECORDING_OVERLAY_LABEL, SCREEN_HANDOFF_EVENT, ());
}

#[cfg(test)]
#[path = "screen_follow_tests.rs"]
mod tests;
