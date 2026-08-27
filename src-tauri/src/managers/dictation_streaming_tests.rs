#[cfg(test)]
impl DictationStreamingHandle {
    /// Ignores the shutdown flag, mirroring a non-cancellable whisper decode.
    pub(crate) fn for_testing_stuck_in_decode(decode_duration: Duration) -> Self {
        let (cmd_tx, _cmd_rx) = mpsc::channel::<Cmd>();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let join = thread::Builder::new()
            .name("dictation-streaming-stuck-test".to_string())
            .spawn(move || {
                // never polls shutdown_flag — emulates a parked FFI decode
                thread::sleep(decode_duration);
            })
            .expect("spawn stuck test worker");
        Self {
            cmd_tx,
            shutdown_flag,
            join: Some(join),
            on_cleanup: Some(Box::new(|| {})),
        }
    }

    /// No-op worker; cleanup observable via injected closure.
    pub(crate) fn for_testing<F>(on_cleanup: F) -> Self
    where
        F: FnOnce() + Send + 'static,
    {
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let shutdown_for_thread = shutdown_flag.clone();
        let join = thread::Builder::new()
            .name("dictation-streaming-test".to_string())
            .spawn(move || {
                loop {
                    if shutdown_for_thread.load(Ordering::Relaxed) {
                        break;
                    }
                    match cmd_rx.recv() {
                        Ok(Cmd::Shutdown) => break,
                        Ok(Cmd::Audio(_)) => continue,
                        Ok(Cmd::Finish(result_tx)) => {
                            let _ = result_tx.send(String::new());
                            break;
                        }
                        Err(_) => break,
                    }
                }
            })
            .expect("spawn test worker");
        Self {
            cmd_tx,
            shutdown_flag,
            join: Some(join),
            on_cleanup: Some(Box::new(on_cleanup)),
        }
    }
}

#[cfg(test)]
mod shutdown_aware_decode_tests {
    use super::decode_or_skip_on_shutdown;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    #[test]
    fn calls_underlying_decode_when_shutdown_is_false() {
        let flag = AtomicBool::new(false);
        let mut errs = 0usize;
        let calls = AtomicUsize::new(0);
        let result = decode_or_skip_on_shutdown(&flag, &[0.1_f32, 0.2], &mut errs, |s| {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok::<String, anyhow::Error>(format!("decoded {} samples", s.len()))
        });
        assert_eq!(result, "decoded 2 samples");
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(errs, 0);
    }

    /// Regression: blocks 30s transcribe_with_timeout if pipeline.push LA-2 loop doesn't bail.
    #[test]
    fn skips_underlying_decode_when_shutdown_is_true() {
        let flag = AtomicBool::new(true);
        let mut errs = 0usize;
        let calls = AtomicUsize::new(0);
        let result =
            decode_or_skip_on_shutdown(&flag, &[1.0_f32; 16_000], &mut errs, |_s| {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok::<String, anyhow::Error>("should not be returned".into())
            });
        assert_eq!(result, "");
        assert_eq!(
            calls.load(Ordering::SeqCst),
            0,
            "underlying decode must not run after shutdown — would extend the join wait"
        );
        assert_eq!(errs, 0, "skipping is not an error path");
    }

    #[test]
    fn surfaces_decode_error_as_empty_string_and_counts_it() {
        let flag = AtomicBool::new(false);
        let mut errs = 0usize;
        let result = decode_or_skip_on_shutdown(&flag, &[0.0_f32], &mut errs, |_s| {
            Err::<String, _>(anyhow::anyhow!("simulated FFI failure"))
        });
        assert_eq!(result, "");
        assert_eq!(errs, 1, "error counter must increment so the warn-rate-limit works");
    }
}

#[cfg(test)]
mod audio_backlog_tests {
    use super::{
        coalesce_audio_backlog, trim_frame_backlog, CapturedAudioFrame, Cmd, TerminalCommand,
        MAX_BACKLOG_SAMPLES,
    };
    use std::sync::mpsc;

    fn frame(samples: usize, is_speech: bool) -> CapturedAudioFrame {
        CapturedAudioFrame {
            samples: vec![0.1; samples],
            is_speech,
        }
    }

    #[test]
    fn merges_adjacent_vad_runs_before_the_next_decode() {
        let (tx, rx) = mpsc::channel();
        tx.send(Cmd::Audio(frame(3, true))).expect("speech frame");
        tx.send(Cmd::Audio(frame(5, false))).expect("silence frame");
        tx.send(Cmd::Audio(frame(7, false))).expect("silence frame");

        let backlog = coalesce_audio_backlog(frame(2, true), &rx);

        assert_eq!(backlog.frames.len(), 2);
        assert_eq!(backlog.frames[0].samples.len(), 5);
        assert!(backlog.frames[0].is_speech);
        assert_eq!(backlog.frames[1].samples.len(), 12);
        assert!(!backlog.frames[1].is_speech);
        assert!(backlog.terminal.is_none());
    }

    #[test]
    fn trims_the_oldest_audio_once_the_backlog_outgrows_the_cap() {
        let mut frames = vec![frame(MAX_BACKLOG_SAMPLES, true), frame(1_000, false)];

        let dropped = trim_frame_backlog(&mut frames);

        assert_eq!(dropped, 1_000);
        assert_eq!(
            frames.iter().map(|f| f.samples.len()).sum::<usize>(),
            MAX_BACKLOG_SAMPLES
        );
        assert!(!frames.last().expect("newest frame").is_speech);
    }

    #[test]
    fn drops_whole_frames_that_fall_entirely_outside_the_cap() {
        let mut frames = vec![frame(2_000, true), frame(MAX_BACKLOG_SAMPLES, false)];

        assert_eq!(trim_frame_backlog(&mut frames), 2_000);
        assert_eq!(frames.len(), 1);
        assert!(!frames[0].is_speech);
    }

    #[test]
    fn leaves_a_backlog_under_the_cap_untouched() {
        let mut frames = vec![frame(16_000, true)];

        assert_eq!(trim_frame_backlog(&mut frames), 0);
        assert_eq!(frames[0].samples.len(), 16_000);
    }

    #[test]
    fn preserves_finish_after_all_queued_audio() {
        let (tx, rx) = mpsc::channel();
        let (result_tx, _result_rx) = mpsc::channel();
        tx.send(Cmd::Audio(frame(3, true))).expect("speech frame");
        tx.send(Cmd::Finish(result_tx)).expect("finish command");

        let backlog = coalesce_audio_backlog(frame(2, true), &rx);

        assert_eq!(backlog.frames[0].samples.len(), 5);
        assert!(matches!(
            backlog.terminal,
            Some(TerminalCommand::Finish(_))
        ));
    }
}

#[cfg(test)]
mod cleanup_guard_tests {
    use super::CleanupGuard;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    #[test]
    fn runs_closure_on_drop_when_not_disarmed() {
        // Spawn-failure path: guard drops before the handle owns cleanup → keepalive must release.
        let ran = Arc::new(AtomicBool::new(false));
        let ran_for_closure = ran.clone();
        {
            let _guard = CleanupGuard::new(Box::new(move || {
                ran_for_closure.store(true, Ordering::SeqCst);
            }));
        }
        assert!(ran.load(Ordering::SeqCst), "armed guard must run cleanup on drop");
    }

    #[test]
    fn does_not_run_closure_after_disarm() {
        // Success path: ownership moves to the handle; the guard must stay silent.
        let ran = Arc::new(AtomicBool::new(false));
        let ran_for_closure = ran.clone();
        let guard = CleanupGuard::new(Box::new(move || {
            ran_for_closure.store(true, Ordering::SeqCst);
        }));
        let taken = guard.disarm();
        assert!(!ran.load(Ordering::SeqCst), "disarm must not run the closure");
        drop(taken);
        assert!(
            !ran.load(Ordering::SeqCst),
            "dropping a moved-out FnOnce must not run it — the handle decides when"
        );
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::time::{Duration, Instant};

    #[test]
    fn explicit_stop_runs_cleanup_exactly_once() {
        let count = Arc::new(AtomicUsize::new(0));
        let count_for_closure = count.clone();
        let handle = DictationStreamingHandle::for_testing(move || {
            count_for_closure.fetch_add(1, Ordering::SeqCst);
        });
        handle.stop();
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    /// Regression: pre-Drop-impl, leaked worker starved next stop-flow → 30s TimedOut.
    #[test]
    fn dropping_handle_without_stop_runs_cleanup() {
        let count = Arc::new(AtomicUsize::new(0));
        let count_for_closure = count.clone();
        {
            let _handle = DictationStreamingHandle::for_testing(move || {
                count_for_closure.fetch_add(1, Ordering::SeqCst);
            });
        }
        assert_eq!(
            count.load(Ordering::SeqCst),
            1,
            "Drop did not run cleanup — worker thread leaked"
        );
    }

    /// Double-cleanup would underflow keepalive AtomicUsize.
    #[test]
    fn explicit_stop_then_drop_runs_cleanup_exactly_once() {
        let count = Arc::new(AtomicUsize::new(0));
        let count_for_closure = count.clone();
        let handle = DictationStreamingHandle::for_testing(move || {
            count_for_closure.fetch_add(1, Ordering::SeqCst);
        });
        handle.stop();
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    /// Pins join-before-cleanup order against future refactor regression.
    #[test]
    fn cleanup_runs_after_worker_join() {
        let worker_alive_at_cleanup = Arc::new(AtomicBool::new(false));
        let worker_alive_for_closure = worker_alive_at_cleanup.clone();
        let handle = DictationStreamingHandle::for_testing(move || {
            worker_alive_for_closure.store(true, Ordering::SeqCst);
        });
        handle.stop();
        assert!(
            worker_alive_at_cleanup.load(Ordering::SeqCst),
            "cleanup closure did not run after join"
        );
    }

    /// Regression: a parked FFI decode must not block `stop()` past the join budget.
    #[test]
    fn stop_detaches_when_worker_stuck_in_decode() {
        let start = Instant::now();
        // Worker sleeps 10s ignoring shutdown; stop() must still return fast.
        let handle = DictationStreamingHandle::for_testing_stuck_in_decode(
            Duration::from_secs(10),
        );
        handle.stop();
        let elapsed = start.elapsed();
        assert!(
            elapsed < Duration::from_secs(3),
            "stop() blocked {elapsed:?} on a stuck worker — should detach near the \
             {WORKER_JOIN_BUDGET:?} budget instead of waiting for the decode"
        );
    }

    /// 1s budget; leak/deadlock blows past it.
    #[test]
    fn drop_completes_within_one_second() {
        let count = Arc::new(AtomicUsize::new(0));
        let count_for_closure = count.clone();
        let start = Instant::now();
        {
            let _h = DictationStreamingHandle::for_testing(move || {
                count_for_closure.fetch_add(1, Ordering::SeqCst);
            });
        }
        let elapsed = start.elapsed();
        assert!(
            elapsed < Duration::from_secs(1),
            "Drop took {elapsed:?} — handle is not releasing the worker promptly"
        );
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }

    /// Construct→drop stress; leaks blow past budget or exhaust resources.
    #[test]
    fn rapid_construct_drop_loop_does_not_leak() {
        let count = Arc::new(AtomicUsize::new(0));
        let start = Instant::now();
        for _ in 0..50 {
            let count_for_closure = count.clone();
            let h = DictationStreamingHandle::for_testing(move || {
                count_for_closure.fetch_add(1, Ordering::SeqCst);
            });
            drop(h);
        }
        let elapsed = start.elapsed();
        assert_eq!(count.load(Ordering::SeqCst), 50, "missing cleanups");
        assert!(
            elapsed < Duration::from_secs(5),
            "50 construct/drop cycles took {elapsed:?} — worker is not exiting fast enough"
        );
    }
}
