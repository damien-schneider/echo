use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Lets the transcription idle watcher skip eviction while a capture runs.
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
        let s = RecordingActiveSignal::new();
        let arc = s.shared();
        s.set(true);
        assert!(arc.load(Ordering::Relaxed));
        s.set(false);
        assert!(!arc.load(Ordering::Relaxed));
    }

    #[test]
    fn clones_share_inner_state() {
        let a = RecordingActiveSignal::new();
        let b = a.clone();
        a.set(true);
        assert!(b.get(), "clone failed to share inner Arc");
        b.set(false);
        assert!(!a.get(), "clone failed to propagate write back");
    }
}
