use crate::audio_toolkit::apply_custom_words;
use crate::managers::model::transcription_profile_id;
use crate::managers::model::{EngineType, ModelManager};
use crate::managers::timeout::{run_with_timeout, TimedOut};
use crate::managers::whisper_runtime::{WhisperDecodeOptions, WhisperRuntime};
use crate::settings::get_settings;
use anyhow::Result;
use log::{debug, error, info, warn};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

/// 16 kHz mono f32 — whisper + parakeet input format.
pub const WHISPER_SAMPLE_RATE: usize = 16_000;
const MIN_STREAMING_LANGUAGE_SPEECH_SAMPLES: usize = WHISPER_SAMPLE_RATE * 2;
const MAX_STREAMING_LANGUAGE_SPEECH_SAMPLES: usize = WHISPER_SAMPLE_RATE * 5;
const MIN_STREAMING_LANGUAGE_CONFIDENCE: f32 = 0.6;

/// Prewarmed decode is ~1s, so this floor surfaces a hang fast; longer clips scale by the multiplier below.
pub const MIN_TRANSCRIPTION_TIMEOUT_SECS: u64 = 8;

/// 3x audio length — first decode after load can approach realtime.
pub const TRANSCRIPTION_TIMEOUT_MULTIPLIER: u64 = 3;

/// 1s silence to JIT-compile whisper.cpp Metal kernels before first real decode.
pub fn build_warmup_audio() -> Vec<f32> {
    vec![0.0_f32; WHISPER_SAMPLE_RATE]
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
    let audio_secs = (audio_len_samples / WHISPER_SAMPLE_RATE) as u64;
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
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Serialize)]
pub struct ModelStateEvent {
    pub event_type: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub error: Option<String>,
}

#[derive(Default)]
struct StreamingLanguageState {
    language: Option<String>,
    speech_probe: Vec<f32>,
}

impl StreamingLanguageState {
    fn observe_audio(&mut self, samples: &[f32], is_speech: bool) {
        if !is_speech || self.language.is_some() {
            return;
        }
        let remaining =
            MAX_STREAMING_LANGUAGE_SPEECH_SAMPLES.saturating_sub(self.speech_probe.len());
        self.speech_probe
            .extend_from_slice(&samples[..samples.len().min(remaining)]);
    }
}

pub struct StreamingTranscriber {
    manager: Arc<TranscriptionManager>,
    state: Mutex<StreamingLanguageState>,
}

impl StreamingTranscriber {
    pub fn new(manager: Arc<TranscriptionManager>, selected_language: &str) -> Result<Self> {
        let language = whisper_language(selected_language)?;
        Ok(Self {
            manager,
            state: Mutex::new(StreamingLanguageState {
                language,
                speech_probe: Vec::with_capacity(MAX_STREAMING_LANGUAGE_SPEECH_SAMPLES),
            }),
        })
    }

    pub fn observe_audio(&self, samples: &[f32], is_speech: bool) {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .observe_audio(samples, is_speech);
    }

    pub fn language_is_pinned(&self) -> bool {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .language
            .is_some()
    }

    pub fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        let language = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            match state.language.clone() {
                Some(language) => Some(language),
                None if state.speech_probe.len() < MIN_STREAMING_LANGUAGE_SPEECH_SAMPLES => None,
                None => {
                    let detection = self
                        .manager
                        .engine
                        .detect_language(&state.speech_probe, preview_thread_count())?;
                    let probe_is_full =
                        state.speech_probe.len() == MAX_STREAMING_LANGUAGE_SPEECH_SAMPLES;
                    if detection.probability < MIN_STREAMING_LANGUAGE_CONFIDENCE && !probe_is_full {
                        None
                    } else {
                        info!(
                            "Streaming language pinned to {} ({:.0}% confidence)",
                            detection.language,
                            detection.probability * 100.0
                        );
                        state.language = Some(detection.language.clone());
                        Some(detection.language)
                    }
                }
            }
        };
        self.manager
            .transcribe_inner(audio, preview_thread_count(), language.as_deref())
    }
}

#[derive(Clone)]
pub struct TranscriptionManager {
    engine: Arc<WhisperRuntime>,
    model_manager: Arc<ModelManager>,
    app_handle: AppHandle,
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
    /// Dedups concurrent prewarm calls racing on ONNX backend.
    prewarm_in_progress: Arc<AtomicBool>,
}

impl TranscriptionManager {
    pub fn new(app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        let manager = Self {
            engine: Arc::new(WhisperRuntime::new()),
            model_manager,
            app_handle: app_handle.clone(),
            is_loading: Arc::new(Mutex::new(false)),
            loading_condvar: Arc::new(Condvar::new()),
            prewarm_in_progress: Arc::new(AtomicBool::new(false)),
        };

        Ok(manager)
    }

    pub fn is_model_loaded(&self) -> bool {
        self.engine.is_loaded()
    }

    fn load_runtime_model(&self, model_id: &str) -> Result<()> {
        let model_info = self
            .model_manager
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;
        if !model_info.is_downloaded {
            return Err(anyhow::anyhow!("Model not downloaded"));
        }
        let model_path = self.model_manager.get_model_path(model_id)?;
        match model_info.engine_type {
            EngineType::Whisper => {
                // observability only — mirrors whisper.cpp's `<stem>-encoder.mlmodelc` lookup
                #[cfg(target_os = "macos")]
                {
                    let stem = model_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("");
                    let mlmodelc = model_path
                        .parent()
                        .map(|p| p.join(format!("{}-encoder.mlmodelc", stem)));
                    match mlmodelc {
                        Some(p) if p.exists() => info!(
                            "Whisper model {}: CoreML encoder found at {} — Apple Neural Engine should activate",
                            model_id,
                            p.display()
                        ),
                        _ => debug!(
                            "Whisper model {}: no sibling `*-encoder.mlmodelc` next to {} — falling back to Metal+CPU encoder",
                            model_id,
                            model_path.display()
                        ),
                    }
                }
                self.engine.load(model_id, &model_path)
            }
            EngineType::Diarization => Err(anyhow::anyhow!(
                "Diarization models cannot be used for transcription"
            )),
            EngineType::Polish => Err(anyhow::anyhow!(
                "Polish models cannot be used for transcription"
            )),
        }
    }

    pub fn load_model(&self, model_id: &str) -> Result<()> {
        let current_model_id = self.engine.current_model_id();
        if !requires_model_load(current_model_id.as_deref(), model_id) {
            return Ok(());
        }
        let load_start = std::time::Instant::now();
        debug!("Starting to load model: {}", model_id);

        let model_name = self.model_manager.get_model_info(model_id).map(|m| m.name);

        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_started".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: None,
                error: None,
            },
        );

        match self.load_runtime_model(model_id) {
            Ok(()) => {}
            Err(e) => {
                let _ = self.app_handle.emit(
                    "model-state-changed",
                    ModelStateEvent {
                        event_type: "loading_failed".to_string(),
                        model_id: Some(model_id.to_string()),
                        model_name: model_name.clone(),
                        error: Some(e.to_string()),
                    },
                );
                return Err(e);
            }
        };

        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_completed".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: model_name.clone(),
                error: None,
            },
        );

        debug!(
            "Successfully loaded transcription model: {} (took {}ms)",
            model_id,
            load_start.elapsed().as_millis()
        );
        Ok(())
    }

    /// Idempotent. Streaming engine is never idle-evicted — caller owns unload on shutdown.
    pub fn load_streaming_model(&self, model_id: &str) -> Result<()> {
        self.load_model(model_id)
    }

    pub fn is_streaming_loaded_with_id(&self, target_id: &str) -> bool {
        self.engine.current_model_id().as_deref() == Some(target_id)
    }

    /// Idempotent. No warmup decode — holding `engine.lock` would starve the stop-flow transcribe.
    pub fn prewarm(&self) -> Result<()> {
        let Some(_guard) = try_acquire_once_flag(&self.prewarm_in_progress) else {
            debug!("prewarm: skipped — another prewarm is already running");
            return Ok(());
        };

        let settings = get_settings(&self.app_handle);
        let model_id = transcription_profile_id(settings.transcription_model_size);
        if !self.is_streaming_loaded_with_id(model_id) {
            if let Err(e) = self.load_model(model_id) {
                warn!("prewarm: main model load failed: {}", e);
                return Ok(());
            }
        }
        Ok(())
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
                warn!("Warmup decode failed (non-fatal): {}", e);
                Ok(())
            }
        }
    }

    pub fn initiate_model_load(&self) {
        let mut is_loading = self.is_loading.lock().unwrap();
        if *is_loading || self.is_model_loaded() {
            return;
        }

        *is_loading = true;
        let self_clone = self.clone();
        thread::spawn(move || {
            let settings = get_settings(&self_clone.app_handle);
            let model_id = transcription_profile_id(settings.transcription_model_size);
            if let Err(e) = self_clone.load_model(model_id) {
                error!("Failed to load model: {}", e);
            }
            let mut is_loading = self_clone.is_loading.lock().unwrap();
            *is_loading = false;
            self_clone.loading_condvar.notify_all();
        });
    }

    pub fn get_current_model(&self) -> Option<String> {
        self.engine.current_model_id()
    }

    pub fn transcribe_for_streaming(&self, audio: Vec<f32>) -> Result<String> {
        self.transcribe_inner(audio, preview_thread_count(), None)
    }

    pub fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        self.transcribe_inner(audio, available_thread_count(), None)
    }

    /// Whisper FFI is non-cancellable: on timeout, worker keeps running until engine mutex released.
    pub fn transcribe_with_timeout(
        &self,
        audio: Vec<f32>,
        limit: Duration,
    ) -> Result<String, TranscribeError> {
        let this = self.clone();
        match run_with_timeout(move || this.transcribe(audio), limit) {
            Ok(Ok(text)) => Ok(text),
            Ok(Err(e)) => Err(TranscribeError::Failed(e.to_string())),
            Err(TimedOut) => Err(TranscribeError::TimedOut),
        }
    }

    fn transcribe_inner(
        &self,
        audio: Vec<f32>,
        threads: i32,
        language_override: Option<&str>,
    ) -> Result<String> {
        let st = std::time::Instant::now();

        debug!("Audio vector length: {}", audio.len());

        if audio.is_empty() {
            debug!("Empty audio vector");
            return Ok(String::new());
        }

        {
            let mut is_loading = self.is_loading.lock().unwrap();
            while *is_loading {
                is_loading = self.loading_condvar.wait(is_loading).unwrap();
            }

            if !self.engine.is_loaded() {
                return Err(anyhow::anyhow!("Model is not loaded for transcription."));
            }
        }

        let settings = get_settings(&self.app_handle);
        let language = match language_override {
            Some(language) => Some(language.to_string()),
            None => whisper_language(&settings.selected_language)?,
        };
        let options = WhisperDecodeOptions {
            language,
            translate: settings.translate_to_english,
            threads,
        };
        let result = self.engine.transcribe(&audio, &options)?;

        let corrected_result = if !settings.custom_words.is_empty() {
            apply_custom_words(
                &result,
                &settings.custom_words,
                settings.word_correction_threshold,
            )
        } else {
            result
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

        Ok(corrected_result.trim().to_string())
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
    if whisper_rs::get_lang_id(language).is_none() {
        anyhow::bail!("Unsupported transcription language: {selected_language}");
    }
    Ok(Some(language.to_string()))
}

#[cfg(test)]
include!("transcription_tests.rs");
