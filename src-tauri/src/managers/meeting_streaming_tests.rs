use super::*;

#[test]
fn rms_zero_for_empty() {
    assert_eq!(rms(&[]), 0.0);
}

#[test]
fn rms_matches_constant() {
    let s = vec![0.1f32; 1000];
    assert!((rms(&s) - 0.1).abs() < 1e-6);
}

#[test]
fn rms_silence_below_threshold() {
    let s = vec![0.0f32; 1000];
    assert!(rms(&s) < SILENCE_RMS_THRESHOLD);
}

#[test]
fn rms_speech_above_threshold() {
    let s = vec![0.05f32; 1000];
    assert!(rms(&s) > SILENCE_RMS_THRESHOLD);
}

#[test]
fn rms_quiet_speech_just_above_threshold() {
    // -35 dBFS conversational speech.
    let s = vec![0.018f32; 1000];
    assert!(rms(&s) > SILENCE_RMS_THRESHOLD);
}

#[test]
fn rms_room_tone_filtered_out() {
    // -45 dBFS USB-mic noise floor — else whisper hallucinates.
    let s = vec![0.0056f32; 1000];
    assert!(rms(&s) < SILENCE_RMS_THRESHOLD);
}

#[test]
fn rms_alternating_signal() {
    // Square wave RMS = peak; tolerate f32 accumulation drift.
    let mut s = Vec::with_capacity(1000);
    for i in 0..1000 {
        s.push(if (i as usize).is_multiple_of(2) {
            0.2
        } else {
            -0.2
        });
    }
    assert!((rms(&s) - 0.2).abs() < 1e-3);
}

#[test]
fn drain_commands_returns_shutdown_when_disconnected() {
    let (tx, rx) = mpsc::channel::<Cmd>();
    drop(tx);
    let (mic, sys, sd) = drain_commands(&rx);
    assert!(mic.is_empty());
    assert!(sys.is_empty());
    assert!(sd);
}

#[test]
fn drain_commands_coalesces_multiple_audio_chunks_per_source() {
    let (tx, rx) = mpsc::channel::<Cmd>();
    tx.send(Cmd::Audio {
        source: StreamingSource::Mic,
        samples: vec![0.1; 4],
    })
    .unwrap();
    tx.send(Cmd::Audio {
        source: StreamingSource::Mic,
        samples: vec![0.2; 3],
    })
    .unwrap();
    tx.send(Cmd::Audio {
        source: StreamingSource::System,
        samples: vec![0.3; 2],
    })
    .unwrap();
    let (mic, sys, sd) = drain_commands(&rx);
    assert_eq!(mic.len(), 7);
    assert_eq!(sys.len(), 2);
    assert!(!sd);
}

/// A worker that fell an hour behind used to materialize the whole queue before trimming it.
#[test]
fn a_long_backlog_never_grows_past_the_cap_while_it_drains() {
    let (tx, rx) = mpsc::channel::<Cmd>();
    let frame = crate::managers::streaming::MAX_BACKLOG_SAMPLES / 4;
    for _ in 0..40 {
        tx.send(Cmd::Audio {
            source: StreamingSource::Mic,
            samples: vec![0.1; frame],
        })
        .unwrap();
    }
    drop(tx);

    let (mic, _sys, _sd) = drain_commands(&rx);

    // Capacity is what the buffer actually peaked at; trimming only shrinks the length.
    assert!(
        mic.capacity() <= 2 * crate::managers::streaming::MAX_BACKLOG_SAMPLES,
        "backlog peaked at {} samples, cap is {}",
        mic.capacity(),
        crate::managers::streaming::MAX_BACKLOG_SAMPLES
    );
}

#[test]
fn drain_commands_surfaces_shutdown_mid_backlog() {
    let (tx, rx) = mpsc::channel::<Cmd>();
    tx.send(Cmd::Audio {
        source: StreamingSource::Mic,
        samples: vec![0.1; 4],
    })
    .unwrap();
    tx.send(Cmd::Shutdown).unwrap();
    tx.send(Cmd::Audio {
        source: StreamingSource::Mic,
        samples: vec![0.2; 4],
    })
    .unwrap();
    let (mic, _sys, sd) = drain_commands(&rx);
    assert!(sd, "shutdown should be reported even mid-backlog");
    // Surface all drained audio; worker decides whether to process.
    assert_eq!(mic.len(), 8);
}

#[test]
fn drain_commands_returns_after_first_when_queue_drains() {
    let (tx, rx) = mpsc::channel::<Cmd>();
    tx.send(Cmd::Audio {
        source: StreamingSource::Mic,
        samples: vec![0.5; 10],
    })
    .unwrap();
    let (mic, sys, sd) = drain_commands(&rx);
    assert_eq!(mic.len(), 10);
    assert!(sys.is_empty());
    assert!(!sd);
}

/// A guest heard through the speakers can sit under -40 dBFS for a whole meeting and still talk.
#[test]
fn quiet_speech_below_the_old_loudness_floor_reaches_a_decode() {
    let crate_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let speech =
        crate::audio_toolkit::load_wav_file(crate_dir.join("tests/fixtures/quiet-speech.wav"))
            .unwrap();
    let vad = crate::audio_toolkit::vad::speech_vad(
        &crate_dir.join("resources/models/silero_vad_v4.onnx"),
    )
    .unwrap();
    let mut preview =
        SourcePreview::new(SpeechFrames::new(Box::new(vad)), StreamingConfig::default());
    let trailing_pause = vec![0.0; 2 * SAMPLE_RATE];
    let mut events = Vec::new();

    for chunk in speech
        .chunks(SAMPLE_RATE / 10)
        .chain(trailing_pause.chunks(SAMPLE_RATE / 10))
    {
        assert!(rms(chunk) < SILENCE_RMS_THRESHOLD);
        events.extend(preview.push(chunk, &mut |_window| "heard".to_string()));
    }

    assert!(
        events
            .iter()
            .any(|event| matches!(event, PipelineEvent::Final { text, .. } if text == "heard")),
        "no line was decoded: {events:?}"
    );
}
