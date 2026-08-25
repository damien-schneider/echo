use super::*;
use std::time::Instant;

#[test]
fn stop_with_no_open_stream_returns_empty_immediately() {
    let rec = AudioRecorder::new().expect("recorder");
    let start = Instant::now();
    let out = rec.stop().expect("stop must not error when never opened");
    assert!(
        out.is_empty(),
        "expected empty buffer, got {} samples",
        out.len()
    );
    assert!(
        start.elapsed() < Duration::from_millis(500),
        "stop() on an unopened recorder must return promptly, took {:?}",
        start.elapsed()
    );
}

#[test]
fn stop_times_out_when_worker_never_replies() {
    let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
    let mut rec = AudioRecorder::new().expect("recorder");
    rec.cmd_tx = Some(cmd_tx);

    let start = Instant::now();
    let result = rec.stop();
    assert!(result.is_err(), "expected a timeout error, got {result:?}");
    let elapsed = start.elapsed();
    assert!(
        elapsed >= Duration::from_millis(1500) && elapsed < Duration::from_secs(3),
        "stop() should time out near the 1.5s budget, took {elapsed:?}"
    );
    drop(cmd_rx);
}

#[test]
fn speech_frame_is_recorded_and_forwarded_with_vad_label() {
    let (frame_tx, frame_rx) = mpsc::channel();
    let mut recorded = RecordedAudioBuffer::default();
    let frame = CapturedAudioFrame {
        is_speech: true,
        samples: vec![0.1, 0.2],
    };

    record_captured_frame(frame, &mut recorded, &Some(frame_tx));

    assert_eq!(recorded.samples, vec![0.1, 0.2]);
    assert_eq!(
        frame_rx.recv().expect("forwarded speech frame"),
        CapturedAudioFrame {
            is_speech: true,
            samples: vec![0.1, 0.2],
        }
    );
}

#[test]
fn noise_frame_is_forwarded_without_entering_recorded_audio() {
    let (frame_tx, frame_rx) = mpsc::channel();
    let mut recorded = RecordedAudioBuffer::default();
    let frame = CapturedAudioFrame {
        is_speech: false,
        samples: vec![0.01, 0.02],
    };

    record_captured_frame(frame, &mut recorded, &Some(frame_tx));

    assert!(recorded.samples.is_empty());
    assert_eq!(
        frame_rx.recv().expect("forwarded noise frame"),
        CapturedAudioFrame {
            is_speech: false,
            samples: vec![0.01, 0.02],
        }
    );
}

#[test]
fn long_pause_inserts_a_bounded_separator_between_utterances() {
    let mut recorded = RecordedAudioBuffer::default();
    record_captured_frame(
        CapturedAudioFrame {
            is_speech: true,
            samples: vec![0.1, 0.2],
        },
        &mut recorded,
        &None,
    );
    record_captured_frame(
        CapturedAudioFrame {
            is_speech: false,
            samples: vec![0.0; LONG_PAUSE_MIN_SAMPLES],
        },
        &mut recorded,
        &None,
    );
    record_captured_frame(
        CapturedAudioFrame {
            is_speech: true,
            samples: vec![0.3, 0.4],
        },
        &mut recorded,
        &None,
    );

    assert_eq!(
        recorded.samples.len(),
        PAUSE_SEPARATOR_SAMPLES + 4,
        "long pauses must be represented without retaining unbounded silence"
    );
    assert_eq!(&recorded.samples[..2], &[0.1, 0.2]);
    assert!(recorded.samples[2..2 + PAUSE_SEPARATOR_SAMPLES]
        .iter()
        .all(|sample| *sample == 0.0));
    assert_eq!(
        &recorded.samples[2 + PAUSE_SEPARATOR_SAMPLES..],
        &[0.3, 0.4]
    );
    assert!(recorded.had_long_pause);
}

#[test]
fn short_pause_keeps_the_fast_contiguous_audio_path() {
    let mut recorded = RecordedAudioBuffer::default();
    for frame in [
        CapturedAudioFrame {
            is_speech: true,
            samples: vec![0.1],
        },
        CapturedAudioFrame {
            is_speech: false,
            samples: vec![0.0; LONG_PAUSE_MIN_SAMPLES - 1],
        },
        CapturedAudioFrame {
            is_speech: true,
            samples: vec![0.2],
        },
    ] {
        record_captured_frame(frame, &mut recorded, &None);
    }

    assert_eq!(recorded.samples, vec![0.1, 0.2]);
    assert!(!recorded.had_long_pause);
}

#[test]
fn taking_a_recording_resets_pause_metadata_and_pending_silence() {
    let mut recorded = RecordedAudioBuffer {
        had_long_pause: true,
        pending_silence_samples: LONG_PAUSE_MIN_SAMPLES,
        samples: vec![0.1],
    };

    let captured = recorded.take_recording();

    assert!(captured.had_long_pause);
    assert_eq!(captured.samples, vec![0.1]);
    assert!(!recorded.had_long_pause);
    assert_eq!(recorded.pending_silence_samples, 0);
    assert!(recorded.samples.is_empty());
}

#[test]
fn silence_watchdog_fires_once_after_enough_digital_silence() {
    let mut watchdog = SilenceWatchdog::new(100);

    assert!(!watchdog.observe(&[0.0; 60]));
    assert!(!watchdog.observe(&[0.0; 39]));
    assert!(watchdog.observe(&[0.0; 1]));
    assert!(!watchdog.observe(&[0.0; 500]), "must fire only once");
}

#[test]
fn silence_watchdog_stays_quiet_when_the_recording_heard_sound() {
    let mut watchdog = SilenceWatchdog::new(100);

    for _ in 0..10 {
        assert!(!watchdog.observe(&[0.0; 90]));
        assert!(!watchdog.observe(&[0.001]));
    }
}

#[test]
fn silence_watchdog_rearms_for_the_next_recording() {
    let mut watchdog = SilenceWatchdog::new(10);

    assert!(watchdog.observe(&[0.0; 10]));

    watchdog.reset();

    assert!(!watchdog.observe(&[0.0; 9]));
    assert!(watchdog.observe(&[0.0; 1]));
}
