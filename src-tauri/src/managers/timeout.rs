//! Worker detached on timeout (whisper FFI is non-cancellable).

use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimedOut;

/// On timeout the orphan worker keeps running until its closure returns.
pub fn run_with_timeout<T, F>(f: F, limit: Duration) -> Result<T, TimedOut>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    let (tx, rx) = mpsc::channel::<T>();
    // Detached on purpose.
    let _ = thread::Builder::new()
        .name("run-with-timeout".to_string())
        .spawn(move || {
            let value = f();
            let _ = tx.send(value);
        });
    match rx.recv_timeout(limit) {
        Ok(v) => Ok(v),
        Err(_) => Err(TimedOut),
    }
}

#[derive(Debug, Clone, Copy)]
pub struct IdleTickInput {
    pub now_ms: u64,
    pub last_activity_ms: u64,
    pub idle_timeout_secs: Option<u64>,
    pub keepalive_users: usize,
    pub recording_active: bool,
    pub model_loaded: bool,
    /// `Immediately` unload runs from transcribe_inner; watcher must skip.
    pub immediate_mode: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdleAction {
    Unload,
    DoNothing,
}

pub fn evaluate_idle_tick(input: IdleTickInput) -> IdleAction {
    if !input.model_loaded || input.immediate_mode {
        return IdleAction::DoNothing;
    }
    if should_unload(
        input.now_ms,
        input.last_activity_ms,
        input.idle_timeout_secs,
        input.keepalive_users,
        input.recording_active,
    ) {
        IdleAction::Unload
    } else {
        IdleAction::DoNothing
    }
}

pub fn should_unload(
    now_ms: u64,
    last_activity_ms: u64,
    idle_timeout_secs: Option<u64>,
    keepalive_users: usize,
    recording_active: bool,
) -> bool {
    let Some(limit_secs) = idle_timeout_secs else {
        return false;
    };
    if keepalive_users > 0 || recording_active {
        return false;
    }
    let elapsed_ms = now_ms.saturating_sub(last_activity_ms);
    elapsed_ms > limit_secs.saturating_mul(1000)
}

#[cfg(test)]
mod tick_tests {
    use super::{evaluate_idle_tick, IdleAction, IdleTickInput};

    fn base() -> IdleTickInput {
        IdleTickInput {
            now_ms: 11 * 60 * 1000,
            last_activity_ms: 0,
            idle_timeout_secs: Some(10 * 60),
            keepalive_users: 0,
            recording_active: false,
            model_loaded: true,
            immediate_mode: false,
        }
    }

    #[test]
    fn tick_unloads_when_idle_and_model_loaded() {
        assert_eq!(evaluate_idle_tick(base()), IdleAction::Unload);
    }

    #[test]
    fn tick_does_nothing_when_model_not_loaded() {
        let input = IdleTickInput {
            model_loaded: false,
            ..base()
        };
        assert_eq!(evaluate_idle_tick(input), IdleAction::DoNothing);
    }

    #[test]
    fn tick_does_nothing_in_immediate_mode() {
        let input = IdleTickInput {
            immediate_mode: true,
            ..base()
        };
        assert_eq!(evaluate_idle_tick(input), IdleAction::DoNothing);
    }

    #[test]
    fn tick_delegates_recording_guard_to_policy() {
        let input = IdleTickInput {
            recording_active: true,
            ..base()
        };
        assert_eq!(evaluate_idle_tick(input), IdleAction::DoNothing);
    }

    #[test]
    fn tick_delegates_keepalive_guard_to_policy() {
        let input = IdleTickInput {
            keepalive_users: 2,
            ..base()
        };
        assert_eq!(evaluate_idle_tick(input), IdleAction::DoNothing);
    }
}

#[cfg(test)]
mod policy_tests {
    use super::should_unload;

    #[test]
    fn policy_should_unload_after_idle() {
        let now = 11 * 60 * 1000;
        assert!(should_unload(now, 0, Some(10 * 60), 0, false));
    }

    #[test]
    fn policy_blocks_unload_when_keepalive_positive() {
        // Regression: was freeing model mid-meeting.
        let now = 11 * 60 * 1000;
        assert!(!should_unload(now, 0, Some(10 * 60), 1, false));
    }

    #[test]
    fn policy_blocks_unload_when_recording_active() {
        // Recording suppresses eviction even if last_activity stale.
        let now = 11 * 60 * 1000;
        assert!(!should_unload(now, 0, Some(10 * 60), 0, true));
    }

    #[test]
    fn policy_keeps_loaded_under_idle_limit() {
        let now = 5 * 60 * 1000;
        assert!(!should_unload(now, 0, Some(10 * 60), 0, false));
    }

    #[test]
    fn policy_never_unloads_when_timeout_disabled() {
        let huge = u64::MAX / 2;
        assert!(!should_unload(huge, 0, None, 0, false));
    }

    #[test]
    fn policy_at_exact_boundary_does_not_unload() {
        // Locks strict `>` against future `>=` regression.
        let limit_secs = 600u64;
        let now_ms = limit_secs * 1000;
        assert!(!should_unload(now_ms, 0, Some(limit_secs), 0, false));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn fast_closure_returns_value() {
        let r = run_with_timeout(|| 42, Duration::from_secs(5));
        assert_eq!(r, Ok(42));
    }

    #[test]
    fn slow_closure_times_out() {
        let r = run_with_timeout(
            || {
                thread::sleep(Duration::from_millis(500));
                "should not be returned"
            },
            Duration::from_millis(50),
        );
        assert_eq!(r, Err(TimedOut));
    }

    #[test]
    fn value_propagated_through_channel() {
        let r = run_with_timeout(
            || {
                let mut v = Vec::new();
                for i in 0..100 {
                    v.push(i * 2);
                }
                v
            },
            Duration::from_secs(5),
        );
        let v = r.expect("expected Ok");
        assert_eq!(v.len(), 100);
        assert_eq!(v[0], 0);
        assert_eq!(v[99], 198);
    }

    #[test]
    fn zero_duration_times_out_when_work_blocks() {
        let r = run_with_timeout(
            || {
                thread::sleep(Duration::from_millis(50));
                1
            },
            Duration::from_millis(0),
        );
        assert_eq!(r, Err(TimedOut));
    }

    #[test]
    fn worker_keeps_running_after_caller_times_out() {
        // Orphan must finish so whisper FFI releases locks.
        let counter = Arc::new(AtomicUsize::new(0));
        let counter_for_worker = counter.clone();
        let r = run_with_timeout(
            move || {
                thread::sleep(Duration::from_millis(120));
                counter_for_worker.fetch_add(1, Ordering::SeqCst);
            },
            Duration::from_millis(20),
        );
        assert_eq!(r, Err(TimedOut));
        thread::sleep(Duration::from_millis(250));
        assert_eq!(
            counter.load(Ordering::SeqCst),
            1,
            "orphan worker should have completed after caller timed out"
        );
    }

    #[test]
    fn panicking_closure_surfaces_as_timeout_for_caller() {
        // Disconnected maps to TimedOut.
        let r = run_with_timeout::<i32, _>(|| panic!("kaboom"), Duration::from_millis(200));
        assert_eq!(r, Err(TimedOut));
    }

    #[test]
    fn near_boundary_closure_returns_value_or_timeout_not_both() {
        // Outcome unpredictable on noisy CI; must not panic/hang.
        for _ in 0..20 {
            let r = run_with_timeout(
                || {
                    thread::sleep(Duration::from_millis(30));
                    "done"
                },
                Duration::from_millis(30),
            );
            assert!(matches!(r, Ok("done") | Err(TimedOut)));
        }
    }
}
