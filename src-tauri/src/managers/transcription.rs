use crate::audio_toolkit::apply_custom_words;
use crate::audio_toolkit::constants::SAMPLE_RATE;
use crate::managers::hallucination::{is_hallucination, HallucinationFilter};
use crate::managers::model::ModelManager;
use crate::managers::timeout::{run_with_timeout, TimedOut};
use crate::managers::whisper_runtime::{
    Decoded, WhisperDecodeOptions, WhisperRuntime, WHISPER_LANGUAGE_CODES,
};
use crate::settings::get_settings;
use anyhow::Result;
use log::{debug, info, warn};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;
use transcribe_cpp::CancelToken;
use usage::UsageTracker;

mod load_failure;
mod loading;
mod usage;

/// A pin needs a window long enough for Whisper's pick to mean something.
const PIN_MIN_WINDOW_SAMPLES: usize = 5 * SAMPLE_RATE;

/// Prewarmed decode is ~1s, so this floor surfaces a hang fast; longer clips scale by the multiplier below.
pub const MIN_TRANSCRIPTION_TIMEOUT_SECS: u64 = 8;

/// 3x audio length — first decode after load can approach realtime.
pub const TRANSCRIPTION_TIMEOUT_MULTIPLIER: u64 = 3;

/// 1s silence to warm the ggml Metal pipeline before first real decode.
pub fn build_warmup_audio() -> Vec<f32> {
    vec![0.0_f32; SAMPLE_RATE]
}

/// RAII flag resetter; covers early-return + panic.
pub struct OnceFlagGuard<'a>(&'a AtomicBool);

impl Drop for OnceFlagGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// CAS-claim a one-at-a-time slot; `None` if held. Dedups racing prewarm callers.
pub fn try_acquire_once_flag(flag: &AtomicBool) -> Option<OnceFlagGuard<'_>> {
    flag.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .ok()
        .map(|_| OnceFlagGuard(flag))
}

/// Wall-clock cap for one transcribe call. Input is sample count at 16 kHz mono.
pub fn transcription_timeout(audio_len_samples: usize) -> Duration {
    let audio_secs = (audio_len_samples / SAMPLE_RATE) as u64;
    let scaled = audio_secs.saturating_mul(TRANSCRIPTION_TIMEOUT_MULTIPLIER);
    Duration::from_secs(scaled.max(MIN_TRANSCRIPTION_TIMEOUT_SECS))
}

#[derive(Debug)]
pub enum TranscribeError {
    Failed(String),
    TimedOut,
}

impl std::fmt::Display for TranscribeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TranscribeError::Failed(msg) => write!(f, "transcription failed: {msg}"),
            TranscribeError::TimedOut => write!(f, "transcription timed out"),
        }
    }
}

impl std::error::Error for TranscribeError {}
use tauri::AppHandle;

#[derive(Clone, Debug, Serialize)]
pub struct ModelStateEvent {
    pub event_type: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub error: Option<String>,
}

/// Two decodes in a row must agree before a language is pinned: one noisy window used to pin the
/// wrong one for the whole meeting.
#[derive(Default)]
struct StreamingLanguageState {
    language: Option<String>,
    candidate: Option<String>,
}

impl StreamingLanguageState {
    fn observe_decode(&mut self, window_samples: usize, decoded: &Decoded) {
        if self.language.is_some() || window_samples < PIN_MIN_WINDOW_SAMPLES {
            return;
        }
        if is_hallucination(&decoded.text, HallucinationFilter::Strict) {
            self.candidate = None;
            return;
        }
        if decoded.language.is_some() && decoded.language == self.candidate {
            info!(
                "Streaming language pinned to {}",
                decoded.language.as_deref().unwrap_or_default()
            );
            self.language = decoded.language.clone();
        } else {
            self.candidate = decoded.language.clone();
        }
    }
}

pub struct StreamingTranscriber {
    manager: Arc<TranscriptionManager>,
    state: Mutex<StreamingLanguageState>,
    cancel: CancelToken,
}

impl StreamingTranscriber {
    pub fn new(manager: Arc<TranscriptionManager>, selected_language: &str) -> Result<Self> {
        let language = whisper_language(selected_language)?;
        Ok(Self {
            manager,
            state: Mutex::new(StreamingLanguageState {
                language,
                candidate: None,
            }),
            cancel: CancelToken::new(),
        })
    }

    /// Aborts the decode in flight and every later one.
    pub fn cancel(&self) {
        self.cancel.cancel();
    }

    fn lock_state(&self) -> std::sync::MutexGuard<'_, StreamingLanguageState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn language_is_pinned(&self) -> bool {
        self.lock_state().language.is_some()
    }

    pub fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        let language = self.lock_state().language.clone();
        let window_samples = audio.len();
        let decoded = self.manager.transcribe_inner(
            audio,
            preview_thread_count(),
            language.as_deref(),
            Some(self.cancel.clone()),
        )?;
        self.lock_state().observe_decode(window_samples, &decoded);
        Ok(decoded.text)
    }
}

#[derive(Clone)]
pub struct TranscriptionManager {
    engine: Arc<WhisperRuntime>,
    model_manager: Arc<ModelManager>,
    app_handle: AppHandle,
    usage: Arc<UsageTracker>,
    prewarm_in_progress: Arc<AtomicBool>,
}

impl TranscriptionManager {
    pub fn new(app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        let manager = Self {
            engine: Arc::new(WhisperRuntime::new()),
            model_manager,
            app_handle: app_handle.clone(),
            usage: Arc::new(UsageTracker::default()),
            prewarm_in_progress: Arc::new(AtomicBool::new(false)),
        };

        Ok(manager)
    }

    pub fn is_model_loaded(&self) -> bool {
        self.engine.is_loaded()
    }

    /// Force-compile Metal kernels via 1s silence decode. No-op if engine unloaded.
    pub fn warmup_decode_dummy(&self) -> Result<()> {
        if !self.is_model_loaded() {
            return Ok(());
        }
        let warmup_start = std::time::Instant::now();
        match self.transcribe(build_warmup_audio()) {
            Ok(_) => {
                debug!(
                    "Warmup decode completed in {}ms",
                    warmup_start.elapsed().as_millis()
                );
                Ok(())
            }
            Err(e) => {
                warn!("Warmup decode failed (non-fatal): {e:#}");
                Ok(())
            }
        }
    }

    pub fn get_current_model(&self) -> Option<String> {
        self.engine.current_model_id()
    }

    pub fn transcribe_for_streaming(&self, audio: Vec<f32>) -> Result<String> {
        Ok(self
            .transcribe_inner(audio, preview_thread_count(), None, None)?
            .text)
    }

    pub fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        Ok(self
            .transcribe_inner(audio, available_thread_count(), None, None)?
            .text)
    }

    pub fn transcribe_with_timeout(
        &self,
        audio: Vec<f32>,
        limit: Duration,
    ) -> Result<String, TranscribeError> {
        self.decode_with_timeout(audio, limit, None)
            .map(|decoded| decoded.text)
    }

    /// A timed-out decode is cancelled, so its worker stops instead of holding the model.
    pub fn decode_with_timeout(
        &self,
        audio: Vec<f32>,
        limit: Duration,
        language: Option<String>,
    ) -> Result<Decoded, TranscribeError> {
        let this = self.clone();
        let cancel = CancelToken::new();
        let worker_cancel = cancel.clone();
        let decode = move || {
            this.transcribe_inner(
                audio,
                available_thread_count(),
                language.as_deref(),
                Some(worker_cancel),
            )
        };
        match run_with_timeout(decode, limit) {
            Ok(Ok(decoded)) => Ok(decoded),
            Ok(Err(e)) => Err(TranscribeError::Failed(e.to_string())),
            Err(TimedOut) => {
                cancel.cancel();
                Err(TranscribeError::TimedOut)
            }
        }
    }

    fn transcribe_inner(
        &self,
        audio: Vec<f32>,
        threads: i32,
        language_override: Option<&str>,
        cancel: Option<CancelToken>,
    ) -> Result<Decoded> {
        let st = std::time::Instant::now();

        debug!("Audio vector length: {}", audio.len());

        if audio.is_empty() {
            debug!("Empty audio vector");
            return Ok(Decoded::default());
        }

        let _decode = self.begin_decode()?;

        let settings = get_settings(&self.app_handle);
        let language = match language_override {
            Some(language) => Some(language.to_string()),
            None => whisper_language(&settings.selected_language)?,
        };
        let options = WhisperDecodeOptions {
            language,
            translate: settings.translate_to_english,
            threads,
            cancel,
        };
        let decoded = self.engine.transcribe(&audio, &options)?;

        let corrected_text = if !settings.custom_words.is_empty() {
            apply_custom_words(
                &decoded.text,
                &settings.custom_words,
                settings.word_correction_threshold,
            )
        } else {
            decoded.text
        };

        let et = std::time::Instant::now();
        let translation_note = if settings.translate_to_english {
            " (translated)"
        } else {
            ""
        };
        info!(
            "Transcription completed in {}ms{}",
            (et - st).as_millis(),
            translation_note
        );

        Ok(Decoded {
            text: corrected_text.trim().to_string(),
            language: decoded.language,
        })
    }
}

fn available_thread_count() -> i32 {
    std::thread::available_parallelism()
        .map(|count| count.get() as i32)
        .unwrap_or(4)
}

fn preview_thread_count() -> i32 {
    available_thread_count().clamp(1, 4)
}

fn requires_model_load(current_model_id: Option<&str>, target_model_id: &str) -> bool {
    current_model_id != Some(target_model_id)
}

pub(crate) fn whisper_language(selected_language: &str) -> Result<Option<String>> {
    let language = match selected_language {
        "auto" => return Ok(None),
        "zh-Hans" | "zh-Hant" => "zh",
        language => language,
    };
    if !WHISPER_LANGUAGE_CODES.contains(&language) {
        anyhow::bail!("Unsupported transcription language: {selected_language}");
    }
    Ok(Some(language.to_string()))
}

#[cfg(test)]
include!("transcription_tests.rs");
