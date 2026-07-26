#[cfg(test)]
mod warmup_tests {
    use super::{build_warmup_audio, WHISPER_SAMPLE_RATE};

    #[test]
    fn warmup_audio_is_one_second_of_silence() {
        let buf = build_warmup_audio();
        assert_eq!(buf.len(), WHISPER_SAMPLE_RATE);
        assert!(buf.iter().all(|s| *s == 0.0));
    }
}

#[cfg(test)]
mod once_flag_tests {
    use super::try_acquire_once_flag;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::{Arc, Barrier};
    use std::thread;

    #[test]
    fn first_acquire_returns_guard_and_flips_flag() {
        let flag = AtomicBool::new(false);
        let g = try_acquire_once_flag(&flag);
        assert!(g.is_some());
        assert!(flag.load(Ordering::SeqCst), "flag must be true while held");
    }

    #[test]
    fn second_acquire_while_held_returns_none() {
        let flag = AtomicBool::new(false);
        let _g1 = try_acquire_once_flag(&flag).expect("first should succeed");
        let g2 = try_acquire_once_flag(&flag);
        assert!(g2.is_none(), "second acquire must fail while first is held");
    }

    #[test]
    fn drop_releases_flag_for_next_caller() {
        let flag = AtomicBool::new(false);
        {
            let _g = try_acquire_once_flag(&flag).expect("first should succeed");
        }
        assert!(!flag.load(Ordering::SeqCst), "flag must reset on drop");
        let g2 = try_acquire_once_flag(&flag);
        assert!(g2.is_some(), "next acquire after drop must succeed");
    }

    #[test]
    fn panic_inside_guarded_scope_still_releases_flag() {
        // Stuck flag would lock out future prewarms forever.
        let flag = Arc::new(AtomicBool::new(false));
        let flag_for_thread = flag.clone();
        let result = thread::spawn(move || {
            let _g = try_acquire_once_flag(&flag_for_thread)
                .expect("first acquire should succeed");
            panic!("simulated panic inside the guarded region");
        })
        .join();
        assert!(result.is_err(), "thread should have panicked");
        assert!(
            !flag.load(Ordering::SeqCst),
            "flag must be released even after panic"
        );
    }

    #[test]
    fn concurrent_callers_observe_exactly_one_guard_at_a_time() {
        let flag = Arc::new(AtomicBool::new(false));
        let in_critical = Arc::new(AtomicUsize::new(0));
        let max_observed = Arc::new(AtomicUsize::new(0));
        let acquired_total = Arc::new(AtomicUsize::new(0));
        let n = 16;
        let barrier = Arc::new(Barrier::new(n));
        let mut joins = Vec::with_capacity(n);
        for _ in 0..n {
            let flag = flag.clone();
            let in_critical = in_critical.clone();
            let max_observed = max_observed.clone();
            let acquired_total = acquired_total.clone();
            let barrier = barrier.clone();
            joins.push(thread::spawn(move || {
                barrier.wait();
                for _ in 0..50 {
                    if let Some(_g) = try_acquire_once_flag(&flag) {
                        let now = in_critical.fetch_add(1, Ordering::SeqCst) + 1;
                        let mut prev = max_observed.load(Ordering::SeqCst);
                        while prev < now
                            && max_observed
                                .compare_exchange(
                                    prev,
                                    now,
                                    Ordering::SeqCst,
                                    Ordering::SeqCst,
                                )
                                .is_err()
                        {
                            prev = max_observed.load(Ordering::SeqCst);
                        }
                        // Force contention.
                        std::hint::spin_loop();
                        in_critical.fetch_sub(1, Ordering::SeqCst);
                        acquired_total.fetch_add(1, Ordering::SeqCst);
                    }
                }
            }));
        }
        for j in joins {
            j.join().unwrap();
        }
        assert_eq!(
            max_observed.load(Ordering::SeqCst),
            1,
            "more than one guard observed alive at once — mutual exclusion broken"
        );
        assert!(
            acquired_total.load(Ordering::SeqCst) > 0,
            "no one acquired the flag — test would be vacuously passing"
        );
    }
}

#[cfg(test)]
mod timeout_tests {
    use super::{
        transcription_timeout, MIN_TRANSCRIPTION_TIMEOUT_SECS, TRANSCRIPTION_TIMEOUT_MULTIPLIER,
        WHISPER_SAMPLE_RATE,
    };
    use std::time::Duration;

    #[test]
    fn timeout_uses_floor_for_zero_audio() {
        assert_eq!(
            transcription_timeout(0),
            Duration::from_secs(MIN_TRANSCRIPTION_TIMEOUT_SECS)
        );
    }

    #[test]
    fn timeout_uses_floor_for_short_audio_under_floor() {
        // 1s × 3 = 3s, under 30s floor.
        let one_second = WHISPER_SAMPLE_RATE;
        assert_eq!(
            transcription_timeout(one_second),
            Duration::from_secs(MIN_TRANSCRIPTION_TIMEOUT_SECS)
        );
    }

    #[test]
    fn timeout_scales_with_long_audio_above_floor() {
        // 60s × 3 = 180s.
        let sixty_seconds = WHISPER_SAMPLE_RATE * 60;
        assert_eq!(
            transcription_timeout(sixty_seconds),
            Duration::from_secs(60 * TRANSCRIPTION_TIMEOUT_MULTIPLIER)
        );
    }

    #[test]
    fn timeout_switches_at_floor_boundary() {
        // At 10s (floor/multiplier) floor saturates; past that multiplier wins.
        // Floor-relative so this stays correct if the floor const changes.
        let boundary_secs =
            (MIN_TRANSCRIPTION_TIMEOUT_SECS / TRANSCRIPTION_TIMEOUT_MULTIPLIER) as usize;
        let at_boundary = WHISPER_SAMPLE_RATE * boundary_secs;
        assert_eq!(
            transcription_timeout(at_boundary),
            Duration::from_secs(MIN_TRANSCRIPTION_TIMEOUT_SECS)
        );
        let just_past_secs = (boundary_secs + 5) as u64;
        let just_past = WHISPER_SAMPLE_RATE * just_past_secs as usize;
        assert_eq!(
            transcription_timeout(just_past),
            Duration::from_secs(just_past_secs * TRANSCRIPTION_TIMEOUT_MULTIPLIER)
        );
    }

    #[test]
    fn timeout_does_not_panic_on_absurd_input() {
        // usize::MAX must saturate not panic.
        let _ = transcription_timeout(usize::MAX);
    }
}

#[cfg(all(test, target_os = "macos"))]
mod macos_backend_feature_tests {
    #[test]
    fn bundled_backend_does_not_probe_for_missing_coreml_artifacts() {
        let manifest = include_str!("../../Cargo.toml");
        let macos_dependency = manifest
            .lines()
            .skip_while(|line| !line.contains("cfg(target_os = \"macos\")"))
            .find(|line| line.starts_with("whisper-rs"))
            .expect("macOS Whisper dependency");

        assert!(macos_dependency.contains("\"metal\""));
        assert!(!macos_dependency.contains("\"coreml\""));
    }
}

#[test]
fn realtime_preview_uses_a_bounded_thread_budget() {
    let threads = preview_thread_count();

    assert!((1..=4).contains(&threads));
}

#[test]
fn resident_model_load_is_a_true_no_op() {
    assert!(!requires_model_load(Some("small"), "small"));
    assert!(requires_model_load(Some("small"), "medium"));
    assert!(requires_model_load(None, "small"));
}
