use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModelUse {
    Loading,
    Transcribing,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct HeldUse {
    model_id: String,
    model_use: ModelUse,
}

impl HeldUse {
    pub(super) fn loading(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
            model_use: ModelUse::Loading,
        }
    }

    pub(super) fn transcribing(model_id: &str) -> Self {
        Self {
            model_id: model_id.to_string(),
            model_use: ModelUse::Transcribing,
        }
    }
}

#[derive(Default)]
pub(super) struct ModelUsage {
    held: Vec<HeldUse>,
    pub(super) load_failure: Option<String>,
}

impl ModelUsage {
    pub(super) fn is_loading(&self) -> bool {
        self.held
            .iter()
            .any(|held| held.model_use == ModelUse::Loading)
    }

    pub(super) fn deletion_refusal(&self, model_id: &str) -> Option<&'static str> {
        let is_held = |model_use: ModelUse| {
            self.held
                .iter()
                .any(|held| held.model_id == model_id && held.model_use == model_use)
        };
        if is_held(ModelUse::Loading) {
            return Some("Wait for the model to finish loading before deleting it");
        }
        if is_held(ModelUse::Transcribing) {
            return Some("Wait for the transcription to finish before deleting this model");
        }
        None
    }

    fn release(&mut self, finished: &HeldUse) {
        if let Some(index) = self.held.iter().position(|held| held == finished) {
            self.held.swap_remove(index);
        }
    }
}

#[derive(Default)]
pub(super) struct UsageTracker {
    usage: Mutex<ModelUsage>,
    changed: Condvar,
}

impl UsageTracker {
    pub(super) fn lock(&self) -> MutexGuard<'_, ModelUsage> {
        self.usage.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(super) fn wait_for_change<'a>(
        &'a self,
        usage: MutexGuard<'a, ModelUsage>,
    ) -> MutexGuard<'a, ModelUsage> {
        self.changed
            .wait(usage)
            .unwrap_or_else(PoisonError::into_inner)
    }

    pub(super) fn begin(self: &Arc<Self>, held: HeldUse) -> ModelUseGuard {
        self.begin_locked(&mut self.lock(), held)
    }

    /// Takes the caller's lock, so the check it just made and this registration are one step.
    pub(super) fn begin_locked(
        self: &Arc<Self>,
        usage: &mut ModelUsage,
        held: HeldUse,
    ) -> ModelUseGuard {
        usage.held.push(held.clone());
        ModelUseGuard {
            tracker: Arc::clone(self),
            held,
        }
    }
}

/// Ends the use on drop, so an early return or a panic never leaves a model marked busy.
pub(super) struct ModelUseGuard {
    tracker: Arc<UsageTracker>,
    held: HeldUse,
}

impl Drop for ModelUseGuard {
    fn drop(&mut self) {
        self.tracker.lock().release(&self.held);
        self.tracker.changed.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::{HeldUse, UsageTracker};
    use std::sync::Arc;
    use std::thread;

    fn refusal(tracker: &UsageTracker, model_id: &str) -> Option<&'static str> {
        tracker.lock().deletion_refusal(model_id)
    }

    #[test]
    fn a_model_that_is_loading_cannot_be_deleted() {
        let tracker = Arc::new(UsageTracker::default());
        let _loading = tracker.begin(HeldUse::loading("medium"));

        assert_eq!(
            refusal(&tracker, "medium"),
            Some("Wait for the model to finish loading before deleting it")
        );
    }

    #[test]
    fn a_model_used_by_a_running_transcription_cannot_be_deleted() {
        let tracker = Arc::new(UsageTracker::default());
        let _decode = tracker.begin(HeldUse::transcribing("medium"));

        assert_eq!(
            refusal(&tracker, "medium"),
            Some("Wait for the transcription to finish before deleting this model")
        );
    }

    #[test]
    fn an_idle_model_can_be_deleted_while_another_one_is_in_use() {
        let tracker = Arc::new(UsageTracker::default());
        let _loading = tracker.begin(HeldUse::loading("large"));
        let _decode = tracker.begin(HeldUse::transcribing("medium"));

        assert_eq!(refusal(&tracker, "small"), None);
    }

    #[test]
    fn a_model_can_be_deleted_once_its_transcription_has_finished() {
        let tracker = Arc::new(UsageTracker::default());

        drop(tracker.begin(HeldUse::transcribing("medium")));

        assert_eq!(refusal(&tracker, "medium"), None);
    }

    #[test]
    fn a_model_stays_in_use_until_its_last_transcription_finishes() {
        let tracker = Arc::new(UsageTracker::default());
        let first = tracker.begin(HeldUse::transcribing("medium"));
        let _second = tracker.begin(HeldUse::transcribing("medium"));

        drop(first);

        assert!(refusal(&tracker, "medium").is_some());
    }

    #[test]
    fn a_load_that_panics_does_not_leave_the_model_loading() {
        let tracker = Arc::new(UsageTracker::default());
        let loading_tracker = Arc::clone(&tracker);

        let load = thread::spawn(move || {
            let _loading = loading_tracker.begin(HeldUse::loading("medium"));
            panic!("load crashed");
        });

        assert!(load.join().is_err());
        assert!(!tracker.lock().is_loading());
        assert_eq!(refusal(&tracker, "medium"), None);
    }
}
