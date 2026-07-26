//! End-to-end coverage of the dictation streaming lifecycle.
//!
//! Drives `DictationStreamingWorker` with an injectable `DictationDecoder` so
//! we can deterministically reproduce the production stop-flow timing without
//! a real model file or AppHandle. Every test asserts a wall-clock upper bound
//! — these tests must catch any regression that re-introduces the 30 s timeout
//! observed in production (worker leak, in-flight decode that doesn't bail on
//! shutdown, stop join blocking on decoder lock contention, etc.).

use echo_app_lib::audio_toolkit::CapturedAudioFrame;
use echo_app_lib::managers::dictation_streaming::{
    DictationDecoder, DictationStreamingWorker, ProgressSink,
};
use echo_app_lib::managers::streaming::StreamingConfig;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Configurable decoder: scriptable per-chunk latency + counters.
struct ScriptedDecoder {
    chunk_latency: Duration,
    chunk_count: AtomicUsize,
    /// Holding-pattern: while held, decode blocks on this mutex (simulates engine.lock contention).
    block_gate: Mutex<()>,
}

impl ScriptedDecoder {
    fn with_latency(latency: Duration) -> Arc<Self> {
        Arc::new(Self {
            chunk_latency: latency,
            chunk_count: AtomicUsize::new(0),
            block_gate: Mutex::new(()),
        })
    }

    fn count(&self) -> usize {
        self.chunk_count.load(Ordering::SeqCst)
    }
}

impl DictationDecoder for ScriptedDecoder {
    fn transcribe_chunk(&self, _audio: Vec<f32>) -> anyhow::Result<String> {
        // Block on gate first (simulates an engine.lock taken by someone else).
        let _g = self.block_gate.lock().unwrap();
        thread::sleep(self.chunk_latency);
        self.chunk_count.fetch_add(1, Ordering::SeqCst);
        Ok("hello world".to_string())
    }
}

/// Captures every emitted display string so tests can assert progress events.
#[derive(Default)]
struct CaptureSink {
    events: Mutex<Vec<String>>,
}

fn speech(samples: Vec<f32>) -> CapturedAudioFrame {
    CapturedAudioFrame {
        is_speech: true,
        samples,
    }
}

impl ProgressSink for CaptureSink {
    fn emit(&self, text: &str) {
        self.events.lock().unwrap().push(text.to_string());
    }
}

fn spawn(
    decoder: Arc<dyn DictationDecoder>,
    sink: Arc<dyn ProgressSink>,
    cleanup_flag: Arc<AtomicBool>,
) -> (
    Arc<DictationStreamingWorker>,
    echo_app_lib::managers::dictation_streaming::DictationStreamingHandle,
) {
    let cleanup_for_closure = cleanup_flag.clone();
    let on_cleanup: Box<dyn FnOnce() + Send> = Box::new(move || {
        cleanup_for_closure.store(true, Ordering::SeqCst);
    });
    DictationStreamingWorker::spawn_with_decoder(
        decoder,
        sink,
        on_cleanup,
        StreamingConfig::default(),
    )
    .expect("spawn worker")
}

/// Production regression: stop must NOT block for >1s even with an in-flight
/// 500ms decode. Reproduces the "release shortcut → 30 s TimedOut" path.
#[test]
fn stop_completes_within_one_second_with_in_flight_slow_decode() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(500));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));
    let (worker, handle) = spawn(
        decoder.clone() as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag.clone(),
    );

    // 1s of speech amplitude — ensures the pipeline routes to decode.
    worker.push_frame(speech(vec![0.1; 16_000]));
    // Let the worker enter its first decode.
    thread::sleep(Duration::from_millis(100));

    let stop_start = Instant::now();
    handle.stop();
    let elapsed = stop_start.elapsed();

    assert!(
        elapsed < Duration::from_secs(1),
        "handle.stop() blocked for {elapsed:?} — production timeout regression"
    );
    assert!(
        cleanup_flag.load(Ordering::SeqCst),
        "on_cleanup never ran — release_keepalive / unload would leak"
    );
}

/// Many queued chunks: stop must bail mid-batch, not drain the queue.
#[test]
fn stop_bails_with_many_queued_chunks() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(200));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));
    let (worker, handle) = spawn(
        decoder.clone() as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag.clone(),
    );

    // Queue 20 chunks (~4s of decode work) before stopping.
    for _ in 0..20 {
        worker.push_frame(speech(vec![0.1; 8_000]));
    }
    thread::sleep(Duration::from_millis(50));

    let stop_start = Instant::now();
    handle.stop();
    let elapsed = stop_start.elapsed();

    assert!(
        elapsed < Duration::from_secs(1),
        "stop drained the whole queue ({elapsed:?}) instead of bailing"
    );
    assert!(
        decoder.count() < 20,
        "expected bail before full drain — got {} decodes",
        decoder.count()
    );
    assert!(cleanup_flag.load(Ordering::SeqCst));
}

/// Drop without explicit stop: Drop impl must still run cleanup + join worker.
#[test]
fn dropping_handle_without_stop_runs_cleanup_promptly() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(100));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));
    let (_worker, handle) = spawn(
        decoder as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag.clone(),
    );

    let drop_start = Instant::now();
    drop(handle);
    let elapsed = drop_start.elapsed();

    assert!(
        elapsed < Duration::from_secs(1),
        "Drop blocked for {elapsed:?} — worker leaked"
    );
    assert!(cleanup_flag.load(Ordering::SeqCst));
}

/// Rapid stop-then-spawn cycle: simulates user mashing the shortcut.
/// Production bug: the second start could find a half-cleaned-up handle and
/// stall the next stop.
#[test]
fn rapid_stop_then_respawn_never_deadlocks() {
    for iteration in 0..5 {
        let decoder = ScriptedDecoder::with_latency(Duration::from_millis(50));
        let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
        let cleanup_flag = Arc::new(AtomicBool::new(false));
        let (worker, handle) = spawn(
            decoder as Arc<dyn DictationDecoder>,
            sink,
            cleanup_flag.clone(),
        );
        worker.push_frame(speech(vec![0.1; 8_000]));
        thread::sleep(Duration::from_millis(20));
        let stop_start = Instant::now();
        handle.stop();
        assert!(
            stop_start.elapsed() < Duration::from_millis(500),
            "iteration {iteration}: stop took {:?}",
            stop_start.elapsed()
        );
        assert!(cleanup_flag.load(Ordering::SeqCst), "iteration {iteration}");
    }
}

/// Stop while decoder is blocked on a held mutex (simulates engine.lock taken
/// by a concurrent main-engine call). Verifies the in-flight decode releases
/// promptly once we let it through.
#[test]
fn stop_does_not_block_on_decoder_contention_after_gate_releases() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(50));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));

    // External hold on the gate — simulates a concurrent transcribe holding
    // engine.lock(). We release it after starting stop.
    let gate_holder = decoder.block_gate.lock().unwrap();

    let (worker, handle) = spawn(
        decoder.clone() as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag.clone(),
    );
    // >= min_window_samples (16k) so the pipeline actually routes to decode and hits the gate;
    // a sub-window push never decodes, leaving the contention path untested.
    worker.push_frame(speech(vec![0.1; 16_000]));
    thread::sleep(Duration::from_millis(30));

    // Spawn stop on a background thread; release the gate slightly after.
    let stop_done = Arc::new(AtomicBool::new(false));
    let stop_done_clone = stop_done.clone();
    let stop_thread = thread::spawn(move || {
        let st = Instant::now();
        handle.stop();
        stop_done_clone.store(true, Ordering::SeqCst);
        st.elapsed()
    });

    // Hold contention for 300ms then release.
    thread::sleep(Duration::from_millis(300));
    drop(gate_holder);

    let elapsed = stop_thread.join().unwrap();
    assert!(
        elapsed < Duration::from_secs(2),
        "stop blocked for {elapsed:?} after contention released"
    );
    assert!(stop_done.load(Ordering::SeqCst));
    assert!(cleanup_flag.load(Ordering::SeqCst));
    assert!(
        decoder.count() >= 1,
        "decode never ran — gate contention was never exercised, so the test proves nothing"
    );
}

/// Push_audio after stop must be a no-op (production: forwarder thread races
/// with stop).
#[test]
fn push_after_stop_is_safe_noop() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(10));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));
    let (worker, handle) = spawn(
        decoder.clone() as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag,
    );
    handle.stop();
    // These must not panic, deadlock, or revive the worker.
    for _ in 0..10 {
        worker.push_frame(speech(vec![0.1; 8_000]));
    }
    thread::sleep(Duration::from_millis(50));
    // Decoder may have run for chunks queued before stop, but should not be growing.
    let n1 = decoder.count();
    thread::sleep(Duration::from_millis(100));
    let n2 = decoder.count();
    assert_eq!(n1, n2, "decoder kept running after stop ({n1} -> {n2})");
}

/// Regression: when streaming model fails to load, the per-chunk decoder
/// must NOT silently fall back to the main engine — that path contends
/// engine.lock with the post-stop final transcribe, which in production
/// produces a 30 s TimedOut on release. We model the contract here: a
/// `StreamingUnavailable` decoder returns empty without touching shared
/// state.
#[test]
fn streaming_unavailable_decoder_returns_empty_without_contention() {
    struct StreamingUnavailable {
        calls: AtomicUsize,
    }
    impl DictationDecoder for StreamingUnavailable {
        fn transcribe_chunk(&self, _audio: Vec<f32>) -> anyhow::Result<String> {
            // Matches the proposed production behavior: streaming engine
            // not loaded -> skip, do NOT borrow the main engine. The worker
            // continues feeding new audio but produces no preview text.
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(String::new())
        }
    }

    let decoder = Arc::new(StreamingUnavailable {
        calls: AtomicUsize::new(0),
    });
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));
    let (worker, handle) = spawn(
        decoder.clone() as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag.clone(),
    );

    for _ in 0..8 {
        worker.push_frame(speech(vec![0.1; 8_000]));
        thread::sleep(Duration::from_millis(20));
    }

    let stop_start = Instant::now();
    handle.stop();
    let elapsed = stop_start.elapsed();
    assert!(
        elapsed < Duration::from_millis(500),
        "stop took {elapsed:?} — worker should bail with no contention"
    );
    assert!(
        decoder.calls.load(Ordering::SeqCst) >= 1,
        "expected at least one call to the decoder"
    );
    assert!(cleanup_flag.load(Ordering::SeqCst));
}

/// Decoder error must be tolerated; worker keeps going (production behavior).
#[test]
fn decoder_errors_do_not_kill_worker() {
    struct ErroringDecoder {
        count: AtomicUsize,
    }
    impl DictationDecoder for ErroringDecoder {
        fn transcribe_chunk(&self, _audio: Vec<f32>) -> anyhow::Result<String> {
            self.count.fetch_add(1, Ordering::SeqCst);
            Err(anyhow::anyhow!("synthetic decode failure"))
        }
    }
    let decoder = Arc::new(ErroringDecoder {
        count: AtomicUsize::new(0),
    });
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));
    let (worker, handle) = spawn(
        decoder.clone() as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag.clone(),
    );

    for _ in 0..5 {
        worker.push_frame(speech(vec![0.1; 8_000]));
        thread::sleep(Duration::from_millis(15));
    }
    let stop_start = Instant::now();
    handle.stop();
    assert!(stop_start.elapsed() < Duration::from_secs(1));
    assert!(decoder.count.load(Ordering::SeqCst) >= 1);
    assert!(cleanup_flag.load(Ordering::SeqCst));
}

#[test]
fn finish_flushes_short_final_frame_and_returns_transcript() {
    let decoder = ScriptedDecoder::with_latency(Duration::ZERO);
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));
    let (worker, handle) = spawn(
        decoder.clone() as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag.clone(),
    );

    worker.push_frame(CapturedAudioFrame {
        is_speech: true,
        samples: vec![0.1; 8_000],
    });
    let transcript = handle.finish().expect("finish streaming session");

    assert_eq!(transcript, "hello world");
    assert_eq!(decoder.count(), 1);
    assert!(cleanup_flag.load(Ordering::SeqCst));
}

#[test]
fn finish_drains_all_frames_queued_before_it() {
    struct SampleCountingDecoder {
        sample_count: AtomicUsize,
    }

    impl DictationDecoder for SampleCountingDecoder {
        fn transcribe_chunk(&self, audio: Vec<f32>) -> anyhow::Result<String> {
            self.sample_count.store(audio.len(), Ordering::SeqCst);
            Ok(format!("{} samples", audio.len()))
        }
    }

    let decoder = Arc::new(SampleCountingDecoder {
        sample_count: AtomicUsize::new(0),
    });
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let cleanup_flag = Arc::new(AtomicBool::new(false));
    let (worker, handle) = spawn(
        decoder.clone() as Arc<dyn DictationDecoder>,
        sink,
        cleanup_flag,
    );

    worker.push_frame(CapturedAudioFrame {
        is_speech: true,
        samples: vec![0.1; 4_000],
    });
    worker.push_frame(CapturedAudioFrame {
        is_speech: false,
        samples: vec![0.0; 2_000],
    });
    worker.push_frame(CapturedAudioFrame {
        is_speech: true,
        samples: vec![0.1; 4_000],
    });
    let transcript = handle.finish().expect("finish streaming session");

    assert_eq!(transcript, "10000 samples");
    assert_eq!(decoder.sample_count.load(Ordering::SeqCst), 10_000);
}
