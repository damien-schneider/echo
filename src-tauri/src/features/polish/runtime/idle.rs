use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// A loaded Polish model holds gigabytes of weights resident for a feature the
/// user touches a few times an hour. Reloading costs seconds off a warm page
/// cache, so the runtime is let go once the user has clearly moved on.
pub(super) const IDLE_RELEASE_AFTER: Duration = Duration::from_secs(600);

/// Coarse on purpose: the check only has to notice minutes of silence.
pub(in crate::features::polish) const IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct RuntimeActivity {
    pub(super) is_loaded: bool,
    pub(super) in_flight: usize,
    pub(super) idle_for: Duration,
}

pub(super) fn should_release_idle_runtime(activity: RuntimeActivity) -> bool {
    activity.is_loaded && activity.in_flight == 0 && activity.idle_for >= IDLE_RELEASE_AFTER
}

/// Tracks what the idle decision needs: when the runtime was last asked for
/// something, and whether anyone is waiting on it right now.
pub(super) struct ActivityTracker {
    last_activity: Mutex<Instant>,
    in_flight: AtomicUsize,
}

impl Default for ActivityTracker {
    fn default() -> Self {
        Self {
            last_activity: Mutex::new(Instant::now()),
            in_flight: AtomicUsize::new(0),
        }
    }
}

impl ActivityTracker {
    pub(super) fn touch(&self) {
        if let Ok(mut last) = self.last_activity.lock() {
            *last = Instant::now();
        }
    }

    /// Holds the runtime for as long as the returned guard lives, so a request
    /// that outlasts the idle deadline never has the server pulled from under
    /// it.
    pub(super) fn begin_request(&self) -> RequestGuard<'_> {
        self.touch();
        self.in_flight.fetch_add(1, Ordering::SeqCst);
        RequestGuard { tracker: self }
    }

    pub(super) fn snapshot(&self, is_loaded: bool) -> RuntimeActivity {
        let idle_for = self
            .last_activity
            .lock()
            .map(|last| last.elapsed())
            .unwrap_or_default();
        RuntimeActivity {
            is_loaded,
            in_flight: self.in_flight.load(Ordering::SeqCst),
            idle_for,
        }
    }
}

pub(super) struct RequestGuard<'a> {
    tracker: &'a ActivityTracker,
}

impl Drop for RequestGuard<'_> {
    fn drop(&mut self) {
        self.tracker.touch();
        self.tracker.in_flight.fetch_sub(1, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn activity(in_flight: usize, idle_for: Duration) -> RuntimeActivity {
        RuntimeActivity {
            is_loaded: true,
            in_flight,
            idle_for,
        }
    }

    #[test]
    fn a_model_nobody_used_for_a_long_while_is_released() {
        assert!(should_release_idle_runtime(activity(
            0,
            IDLE_RELEASE_AFTER + Duration::from_secs(1)
        )));
    }

    #[test]
    fn a_request_in_flight_keeps_the_model_loaded() {
        assert!(!should_release_idle_runtime(activity(
            1,
            IDLE_RELEASE_AFTER * 10
        )));
    }

    #[test]
    fn a_model_used_moments_ago_stays_loaded() {
        assert!(!should_release_idle_runtime(activity(
            0,
            Duration::from_secs(1)
        )));
    }

    #[test]
    fn an_unloaded_runtime_has_nothing_to_release() {
        assert!(!should_release_idle_runtime(RuntimeActivity {
            is_loaded: false,
            in_flight: 0,
            idle_for: IDLE_RELEASE_AFTER * 10,
        }));
    }

    #[test]
    fn the_release_deadline_outlasts_a_pause_between_two_corrections() {
        assert!(IDLE_RELEASE_AFTER >= Duration::from_secs(300));
        assert!(IDLE_CHECK_INTERVAL < IDLE_RELEASE_AFTER);
    }

    #[test]
    fn an_in_flight_request_is_counted_until_it_finishes() {
        let tracker = ActivityTracker::default();

        let guard = tracker.begin_request();
        assert_eq!(tracker.snapshot(true).in_flight, 1);
        drop(guard);

        assert_eq!(tracker.snapshot(true).in_flight, 0);
    }

    /// A correction can take longer than the idle deadline; what counts as the
    /// last activity is when it ended, not when it started.
    #[test]
    fn finishing_a_request_restarts_the_idle_countdown() {
        let tracker = ActivityTracker::default();
        *tracker.last_activity.lock().unwrap() = Instant::now() - IDLE_RELEASE_AFTER * 2;

        drop(tracker.begin_request());

        assert!(tracker.snapshot(true).idle_for < Duration::from_secs(1));
    }
}
