use anyhow::{anyhow, Context, Result};
use log::{info, warn};
use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};
use transcribe_cpp::{
    CancelToken, Error as EngineError, Model, ModelOptions, RunOptions, Session, SessionOptions,
    Task, Transcript,
};

const MAX_RETAINED_DECODE_STATES: usize = 2;

/// Whisper's language table, in token order (transcribe.cpp `arch/whisper/bin_load.cpp`).
pub const WHISPER_LANGUAGE_CODES: [&str; 100] = [
    "en", "zh", "de", "es", "ru", "ko", "fr", "ja", "pt", "tr", "pl", "ca", "nl", "ar", "sv", "it",
    "id", "hi", "fi", "vi", "he", "uk", "el", "ms", "cs", "ro", "da", "hu", "ta", "no", "th", "ur",
    "hr", "bg", "lt", "la", "mi", "ml", "cy", "sk", "te", "fa", "lv", "bn", "sr", "az", "sl", "kn",
    "et", "mk", "br", "eu", "is", "hy", "ne", "mn", "bs", "kk", "sq", "sw", "gl", "mr", "pa", "si",
    "km", "sn", "yo", "so", "af", "oc", "ka", "be", "tg", "sd", "gu", "am", "yi", "lo", "uz", "fo",
    "ht", "ps", "tk", "nn", "mt", "sa", "lb", "my", "bo", "tl", "mg", "as", "tt", "haw", "ln",
    "ha", "ba", "jw", "su", "yue",
];

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
}

impl<T> Default for SharedModelSlot<T> {
    fn default() -> Self {
        Self::new()
    }
}

struct PooledDecodeState<T> {
    key: String,
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

    fn acquire(&self, key: &str) -> Option<T> {
        let mut states = self
            .states
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let index = states.iter().rposition(|entry| entry.key == key)?;
        Some(states.swap_remove(index).state)
    }

    fn release(&self, key: &str, state: T) {
        let mut states = self
            .states
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if states.len() < self.capacity {
            states.push(PooledDecodeState {
                key: key.to_string(),
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
    pub cancel: Option<CancelToken>,
}

/// The language is the one the decode ran in: the hint when one was given, else Whisper's pick.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Decoded {
    pub text: String,
    pub language: Option<String>,
}

pub struct WhisperRuntime {
    load_lock: Mutex<()>,
    models: SharedModelSlot<Model>,
    sessions: DecodeStatePool<Session>,
}

impl WhisperRuntime {
    pub fn new() -> Self {
        Self {
            load_lock: Mutex::new(()),
            models: SharedModelSlot::new(),
            sessions: DecodeStatePool::new(MAX_RETAINED_DECODE_STATES),
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
        let model = Model::load_with(path, &ModelOptions::default())
            .with_context(|| format!("load Whisper model {}", path.display()))?;
        info!(
            "Loaded shared Whisper model {model_id} on {}",
            model.backend()
        );
        self.sessions.clear();
        self.models.install(model_id, model);
        Ok(())
    }

    pub fn current_model_id(&self) -> Option<String> {
        self.models.current().map(|lease| lease.model_id)
    }

    pub fn is_loaded(&self) -> bool {
        self.models.current().is_some()
    }

    pub fn transcribe(&self, audio: &[f32], options: &WhisperDecodeOptions) -> Result<Decoded> {
        if audio.is_empty() {
            return Ok(Decoded::default());
        }
        let lease = self
            .models
            .current()
            .context("Whisper model is not loaded")?;
        let session_key = format!("{}@{}", lease.model_id, options.threads);
        let mut session = match self.sessions.acquire(&session_key) {
            Some(session) => session,
            None => lease
                .model
                .session_with(&SessionOptions {
                    n_threads: options.threads,
                    ..Default::default()
                })
                .context("create Whisper decode session")?,
        };
        if let Some(cancel) = &options.cancel {
            session.set_cancel_token(cancel);
        }
        let run_options = RunOptions {
            language: options.language.clone(),
            task: if options.translate {
                Task::Translate
            } else {
                Task::Transcribe
            },
            ..Default::default()
        };
        let outcome = session.run(audio, &run_options);
        session.clear_cancel_token();
        if self.current_model_id().as_deref() == Some(lease.model_id.as_str()) {
            self.sessions.release(&session_key, session);
        }
        let transcript = finished_transcript(outcome)?;
        Ok(Decoded {
            text: transcript.text,
            language: options.language.clone().or(transcript.language),
        })
    }
}

impl Default for WhisperRuntime {
    fn default() -> Self {
        Self::new()
    }
}

/// A decode stopped at the token budget or on a repetition loop still returns the text before it.
fn finished_transcript(outcome: transcribe_cpp::Result<Transcript>) -> Result<Transcript> {
    match outcome {
        Ok(transcript) => Ok(transcript),
        Err(EngineError::Aborted { .. }) => Err(anyhow!("transcription cancelled")),
        Err(
            EngineError::OutputTruncated {
                message,
                partial: Some(partial),
            }
            | EngineError::OutputRepetition {
                message,
                partial: Some(partial),
            },
        ) => {
            warn!("Whisper decode stopped early, keeping its partial text: {message}");
            Ok(*partial)
        }
        Err(error) => Err(error).context("run Whisper transcription"),
    }
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
        pool.release("small@4", String::from("state"));

        assert_eq!(pool.acquire("small@4"), Some(String::from("state")));
        assert_eq!(pool.acquire("small@4"), None);
    }

    #[test]
    fn decode_state_pool_never_reuses_state_across_models() {
        let pool = DecodeStatePool::new(2);
        pool.release("small@4", String::from("small state"));

        assert_eq!(pool.acquire("medium@4"), None);
    }
}
