//! Cross-manager signal primitives. Currently exposes a single shared
//! "is the microphone recording right now?" flag that lets the transcription
//! manager's idle watcher suppress eviction while a capture is in progress.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Shared "microphone capture in progress" signal. `AudioRecordingManager`
/// flips this on start/stop; the transcription idle watcher reads it through
/// the same `Arc` to decide whether it's safe to free the engine.
#[derive(Clone, Default)]
pub struct RecordingActiveSignal {
    inner: Arc<AtomicBool>,
}

impl RecordingActiveSignal {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&self, active: bool) {
        self.inner.store(active, Ordering::Relaxed);
    }

    pub fn get(&self) -> bool {
        self.inner.load(Ordering::Relaxed)
    }

    /// Hand out the underlying `Arc` so other managers can share the same
    /// flag without going through the `RecordingActiveSignal` wrapper.
    pub fn shared(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.inner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signal_defaults_to_false() {
        let s = RecordingActiveSignal::new();
        assert!(!s.get());
    }

    #[test]
    fn signal_round_trips_true_then_false() {
        let s = RecordingActiveSignal::new();
        s.set(true);
        assert!(s.get());
        s.set(false);
        assert!(!s.get());
    }

    #[test]
    fn shared_arc_observes_wrapper_writes() {
        // The bare `Arc<AtomicBool>` handed to `TranscriptionManager::
        // link_recording_signal` must reflect later `set()` calls from the
        // original wrapper — otherwise the watcher reads a stale snapshot.
        let s = RecordingActiveSignal::new();
        let arc = s.shared();
        s.set(true);
        assert!(arc.load(Ordering::Relaxed));
        s.set(false);
        assert!(!arc.load(Ordering::Relaxed));
    }

    #[test]
    fn clones_share_inner_state() {
        // `clone()` must share the same `Arc<AtomicBool>` — that's what lets
        // the audio manager flip the flag while the transcription watcher
        // reads it in another thread. A deep-copy clone would silently break
        // the cross-manager link.
        let a = RecordingActiveSignal::new();
        let b = a.clone();
        a.set(true);
        assert!(b.get(), "clone failed to share inner Arc");
        b.set(false);
        assert!(!a.get(), "clone failed to propagate write back");
    }
}
