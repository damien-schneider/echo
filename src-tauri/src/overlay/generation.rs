use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) struct OverlayGenerationToken(u64);

pub(super) struct OverlayGeneration(AtomicU64);

impl OverlayGeneration {
    pub(super) const fn new() -> Self {
        Self(AtomicU64::new(0))
    }

    pub(super) fn begin(&self) -> OverlayGenerationToken {
        OverlayGenerationToken(self.0.fetch_add(1, Ordering::SeqCst).wrapping_add(1))
    }

    pub(super) fn is_current(&self, token: OverlayGenerationToken) -> bool {
        self.0.load(Ordering::SeqCst) == token.0
    }
}

impl Default for OverlayGeneration {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_overlay_generation_invalidates_pending_hide() {
        let generation = OverlayGeneration::default();
        let warning = generation.begin();
        let recording = generation.begin();

        assert!(!generation.is_current(warning));
        assert!(generation.is_current(recording));
    }

    #[test]
    fn explicit_hide_invalidates_pending_transient_hide() {
        let generation = OverlayGeneration::default();
        let tool = generation.begin();

        generation.begin();

        assert!(!generation.is_current(tool));
    }
}
