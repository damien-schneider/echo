//! Worker detached on timeout; a caller that can abort the work cancels it itself.

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
