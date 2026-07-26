use anyhow::{Context, Result};
use log::{info, warn};
use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};
use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState,
};

const MAX_RETAINED_DECODE_STATES: usize = 2;

struct ModelLease<T> {
    pub model_id: String,
    pub model: Arc<T>,
}

impl<T> Clone for ModelLease<T> {
    fn clone(&self) -> Self {
        Self {
            model_id: self.model_id.clone(),
            model: self.model.clone(),
        }
    }
}

struct SharedModelSlot<T> {
    loaded: RwLock<Option<ModelLease<T>>>,
}

impl<T> SharedModelSlot<T> {
    fn new() -> Self {
        Self {
            loaded: RwLock::new(None),
        }
    }

    fn install(&self, model_id: &str, model: T) {
        let mut loaded = self
            .loaded
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *loaded = Some(ModelLease {
            model_id: model_id.to_string(),
            model: Arc::new(model),
        });
    }

    fn current(&self) -> Option<ModelLease<T>> {
        self.loaded
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    fn unload(&self) {
        let mut loaded = self
            .loaded
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *loaded = None;
    }
}

impl<T> Default for SharedModelSlot<T> {
    fn default() -> Self {
        Self::new()
    }
}

struct PooledDecodeState<T> {
    model_id: String,
    state: T,
}

struct DecodeStatePool<T> {
    capacity: usize,
    states: Mutex<Vec<PooledDecodeState<T>>>,
}

impl<T> DecodeStatePool<T> {
    fn new(capacity: usize) -> Self {
        Self {
            capacity,
            states: Mutex::new(Vec::with_capacity(capacity)),
        }
    }

    fn acquire(&self, model_id: &str) -> Option<T> {
        let mut states = self
            .states
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let index = states
            .iter()
            .rposition(|entry| entry.model_id == model_id)?;
        Some(states.swap_remove(index).state)
    }

    fn release(&self, model_id: &str, state: T) {
        let mut states = self
            .states
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if states.len() < self.capacity {
            states.push(PooledDecodeState {
                model_id: model_id.to_string(),
                state,
            });
        }
    }

    fn clear(&self) {
        self.states
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    }
}

#[derive(Clone, Debug)]
pub struct WhisperDecodeOptions {
    pub language: Option<String>,
    pub translate: bool,
    pub threads: i32,
}

pub struct WhisperRuntime {
    load_lock: Mutex<()>,
    models: SharedModelSlot<WhisperContext>,
    states: DecodeStatePool<WhisperState>,
}

impl WhisperRuntime {
    pub fn new() -> Self {
        Self {
            load_lock: Mutex::new(()),
            models: SharedModelSlot::new(),
            states: DecodeStatePool::new(MAX_RETAINED_DECODE_STATES),
        }
    }

    pub fn load(&self, model_id: &str, path: &Path) -> Result<()> {
        let _load_guard = self
            .load_lock
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if self.current_model_id().as_deref() == Some(model_id) {
            return Ok(());
        }
        let context = load_context_with_gpu_fallback(path)?;
        self.states.clear();
        self.models.install(model_id, context);
        info!("Loaded shared Whisper context for {model_id}");
        Ok(())
    }

    pub fn unload(&self) {
        self.states.clear();
        self.models.unload();
    }

    pub fn current_model_id(&self) -> Option<String> {
        self.models.current().map(|lease| lease.model_id)
    }

    pub fn is_loaded(&self) -> bool {
        self.models.current().is_some()
    }

    pub fn transcribe(&self, audio: &[f32], options: &WhisperDecodeOptions) -> Result<String> {
        if audio.is_empty() {
            return Ok(String::new());
        }
        let lease = self
            .models
            .current()
            .context("Whisper model is not loaded")?;
        let mut state = match self.states.acquire(&lease.model_id) {
            Some(state) => state,
            None => lease
                .model
                .create_state()
                .context("create Whisper decode state")?,
        };
        let params = build_params(options);
        if let Err(error) = state.full(params, audio) {
            return Err(error).context("run Whisper transcription");
        }
        let text = state
            .as_iter()
            .map(|segment| segment.to_string())
            .collect::<String>();
        if self.current_model_id().as_deref() == Some(lease.model_id.as_str()) {
            self.states.release(&lease.model_id, state);
        }
        Ok(text)
    }
}

impl Default for WhisperRuntime {
    fn default() -> Self {
        Self::new()
    }
}

fn load_context_with_gpu_fallback(path: &Path) -> Result<WhisperContext> {
    let mut gpu = WhisperContextParameters::default();
    gpu.use_gpu(true).flash_attn(true);
    match WhisperContext::new_with_params(path, gpu) {
        Ok(context) => Ok(context),
        Err(error) => {
            warn!("GPU Whisper load failed ({error}); retrying on CPU");
            let mut cpu = WhisperContextParameters::default();
            cpu.use_gpu(false).flash_attn(false);
            WhisperContext::new_with_params(path, cpu).context("load Whisper model on CPU")
        }
    }
}

fn build_params(options: &WhisperDecodeOptions) -> FullParams<'_, '_> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(options.language.as_deref());
    params.set_translate(options.translate);
    params.set_n_threads(options.threads);
    params.set_no_context(true);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_special(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params
}

#[cfg(test)]
mod tests {
    use super::{DecodeStatePool, SharedModelSlot};
    use std::sync::Arc;

    #[test]
    fn concurrent_sessions_share_one_model_allocation() {
        let slot = SharedModelSlot::new();
        slot.install("medium", String::from("loaded weights"));

        let first = slot.current().expect("first session model");
        let second = slot.current().expect("second session model");

        assert!(Arc::ptr_eq(&first.model, &second.model));
        assert_eq!(first.model_id, "medium");
    }

    #[test]
    fn installing_new_size_atomically_replaces_future_sessions() {
        let slot = SharedModelSlot::new();
        slot.install("small", String::from("small weights"));
        let existing = slot.current().expect("existing model");

        slot.install("large", String::from("large weights"));
        let replacement = slot.current().expect("replacement model");

        assert_eq!(existing.model_id, "small");
        assert_eq!(replacement.model_id, "large");
        assert!(!Arc::ptr_eq(&existing.model, &replacement.model));
    }

    #[test]
    fn decode_state_pool_reuses_state_for_the_same_model() {
        let pool = DecodeStatePool::new(2);
        pool.release("small", String::from("state"));

        assert_eq!(pool.acquire("small"), Some(String::from("state")));
        assert_eq!(pool.acquire("small"), None);
    }

    #[test]
    fn decode_state_pool_never_reuses_state_across_models() {
        let pool = DecodeStatePool::new(2);
        pool.release("small", String::from("small state"));

        assert_eq!(pool.acquire("medium"), None);
    }
}
