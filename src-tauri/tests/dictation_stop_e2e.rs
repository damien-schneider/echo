//! Dictation stop-flow timing; each test bounds wall-clock to catch the 30 s stop regression.

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
) -> (
    Arc<DictationStreamingWorker>,
    echo_app_lib::managers::dictation_streaming::DictationStreamingHandle,
) {
    DictationStreamingWorker::spawn_with_decoder(decoder, sink, StreamingConfig::default())
        .expect("spawn worker")
}

/// Stop must not block >1s behind an in-flight 500ms decode.
#[test]
fn stop_completes_within_one_second_with_in_flight_slow_decode() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(500));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let (worker, handle) = spawn(decoder.clone() as Arc<dyn DictationDecoder>, sink);

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
}

/// Many queued chunks: stop must bail mid-batch, not drain the queue.
#[test]
fn stop_bails_with_many_queued_chunks() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(200));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let (worker, handle) = spawn(decoder.clone() as Arc<dyn DictationDecoder>, sink);

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
}

/// Drop without explicit stop must still stop the worker promptly.
#[test]
fn dropping_handle_without_stop_stops_promptly() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(100));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let (_worker, handle) = spawn(decoder as Arc<dyn DictationDecoder>, sink);

    let drop_start = Instant::now();
    drop(handle);
    let elapsed = drop_start.elapsed();

    assert!(
        elapsed < Duration::from_secs(1),
        "Drop blocked for {elapsed:?} — worker leaked"
    );
}

/// Shortcut mashing: a half-stopped previous handle must not stall the next stop.
#[test]
fn rapid_stop_then_respawn_never_deadlocks() {
    for iteration in 0..5 {
        let decoder = ScriptedDecoder::with_latency(Duration::from_millis(50));
        let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
        let (worker, handle) = spawn(decoder as Arc<dyn DictationDecoder>, sink);
        worker.push_frame(speech(vec![0.1; 8_000]));
        thread::sleep(Duration::from_millis(20));
        let stop_start = Instant::now();
        handle.stop();
        assert!(
            stop_start.elapsed() < Duration::from_millis(500),
            "iteration {iteration}: stop took {:?}",
            stop_start.elapsed()
        );
    }
}

/// Decode blocked on a held mutex (engine.lock contention) must release once the gate opens.
#[test]
fn stop_does_not_block_on_decoder_contention_after_gate_releases() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(50));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());

    // External hold on the gate — simulates a concurrent transcribe holding
    // engine.lock(). We release it after starting stop.
    let gate_holder = decoder.block_gate.lock().unwrap();

    let (worker, handle) = spawn(decoder.clone() as Arc<dyn DictationDecoder>, sink);
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
    assert!(
        decoder.count() >= 1,
        "decode never ran — gate contention was never exercised, so the test proves nothing"
    );
}

/// Forwarder thread races stop: push after stop must be a no-op.
#[test]
fn push_after_stop_is_safe_noop() {
    let decoder = ScriptedDecoder::with_latency(Duration::from_millis(10));
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let (worker, handle) = spawn(decoder.clone() as Arc<dyn DictationDecoder>, sink);
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

/// Missing streaming model yields empty previews; never borrows the main engine.
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
    let (worker, handle) = spawn(decoder.clone() as Arc<dyn DictationDecoder>, sink);

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
}

/// Decode errors are tolerated; the worker keeps going.
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
    let (worker, handle) = spawn(decoder.clone() as Arc<dyn DictationDecoder>, sink);

    for _ in 0..5 {
        worker.push_frame(speech(vec![0.1; 8_000]));
        thread::sleep(Duration::from_millis(15));
    }
    let stop_start = Instant::now();
    handle.stop();
    assert!(stop_start.elapsed() < Duration::from_secs(1));
    assert!(decoder.count.load(Ordering::SeqCst) >= 1);
}

/// Releasing the shortcut must not wait for a preview decode nobody will read.
#[test]
fn stop_cancels_the_decode_in_flight_instead_of_waiting_for_it() {
    struct CancellableDecoder {
        cancelled: AtomicBool,
    }

    impl DictationDecoder for CancellableDecoder {
        fn transcribe_chunk(&self, _audio: Vec<f32>) -> anyhow::Result<String> {
            let deadline = Instant::now() + Duration::from_secs(5);
            while !self.cancelled.load(Ordering::SeqCst) && Instant::now() < deadline {
                thread::sleep(Duration::from_millis(5));
            }
            Ok(String::new())
        }

        fn cancel(&self) {
            self.cancelled.store(true, Ordering::SeqCst);
        }
    }

    let decoder = Arc::new(CancellableDecoder {
        cancelled: AtomicBool::new(false),
    });
    let sink: Arc<dyn ProgressSink> = Arc::new(CaptureSink::default());
    let (worker, handle) = spawn(decoder, sink);
    worker.push_frame(speech(vec![0.1; 16_000]));
    thread::sleep(Duration::from_millis(100));

    let stop_start = Instant::now();
    handle.stop();
    let elapsed = stop_start.elapsed();

    assert!(
        elapsed < Duration::from_millis(300),
        "stop waited {elapsed:?} on a decode it should have cancelled"
    );
}
