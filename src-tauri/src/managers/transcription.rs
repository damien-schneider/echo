use crate::audio_toolkit::apply_custom_words;
use crate::managers::model::{EngineType, ModelManager};
use crate::settings::{get_settings, ModelUnloadTimeout};
use anyhow::Result;
use log::{debug, error, info, warn};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};
use transcribe_rs::{
    onnx::{
        parakeet::{ParakeetModel, ParakeetParams, TimestampGranularity},
        Quantization,
    },
    whisper_cpp::{WhisperEngine, WhisperInferenceParams},
};

#[derive(Clone, Debug, Serialize)]
pub struct ModelStateEvent {
    pub event_type: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub error: Option<String>,
}

enum LoadedEngine {
    Whisper(WhisperEngine),
    Parakeet(ParakeetModel),
}

#[derive(Clone)]
pub struct TranscriptionManager {
    engine: Arc<Mutex<Option<LoadedEngine>>>,
    /// Separate engine slot used by the realtime streaming worker, holding
    /// whatever model `settings.realtime_model` points at. Decoupled from the
    /// main `engine` so the batch (post-stop) pass and the live worker don't
    /// fight over the same Mutex AND can use different model sizes.
    streaming_engine: Arc<Mutex<Option<LoadedEngine>>>,
    streaming_model_id: Arc<Mutex<Option<String>>>,
    model_manager: Arc<ModelManager>,
    app_handle: AppHandle,
    current_model_id: Arc<Mutex<Option<String>>>,
    last_activity: Arc<AtomicU64>,
    shutdown_signal: Arc<AtomicBool>,
    watcher_handle: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
    streaming_buffer: Arc<Mutex<Vec<f32>>>,
    last_partial_update: Arc<Mutex<std::time::Instant>>,
    streaming_in_progress: Arc<AtomicBool>,
    /// Adaptive max samples for streaming - dynamically adjusted based on transcription performance
    /// Starts at None (no limit), then caps when transcription exceeds 800ms
    adaptive_max_samples: Arc<Mutex<Option<usize>>>,
    /// Generation counter for the current streaming session, used to discard
    /// stale streaming chunks that belong to a previous recording.
    active_generation: Arc<AtomicU64>,
    /// Number of active long-lived consumers (e.g. realtime meeting workers)
    /// that need the model to stay loaded across `transcribe()` calls. While
    /// non-zero, the `Immediately` unload path is suppressed so each decode
    /// doesn't trigger a full reload cycle.
    keepalive_users: Arc<AtomicUsize>,
}

impl TranscriptionManager {
    pub fn new(app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        let manager = Self {
            engine: Arc::new(Mutex::new(None)),
            streaming_engine: Arc::new(Mutex::new(None)),
            streaming_model_id: Arc::new(Mutex::new(None)),
            model_manager,
            app_handle: app_handle.clone(),
            current_model_id: Arc::new(Mutex::new(None)),
            last_activity: Arc::new(AtomicU64::new(
                SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64,
            )),
            shutdown_signal: Arc::new(AtomicBool::new(false)),
            watcher_handle: Arc::new(Mutex::new(None)),
            is_loading: Arc::new(Mutex::new(false)),
            loading_condvar: Arc::new(Condvar::new()),
            streaming_buffer: Arc::new(Mutex::new(Vec::new())),
            last_partial_update: Arc::new(Mutex::new(std::time::Instant::now())),
            streaming_in_progress: Arc::new(AtomicBool::new(false)),
            adaptive_max_samples: Arc::new(Mutex::new(None)),
            active_generation: Arc::new(AtomicU64::new(0)),
            keepalive_users: Arc::new(AtomicUsize::new(0)),
        };

        // Start the idle watcher
        {
            let app_handle_cloned = app_handle.clone();
            let manager_cloned = manager.clone();
            let shutdown_signal = manager.shutdown_signal.clone();
            let handle = thread::spawn(move || {
                while !shutdown_signal.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_secs(10)); // Check every 10 seconds

                    // Check shutdown signal again after sleep
                    if shutdown_signal.load(Ordering::Relaxed) {
                        break;
                    }

                    let settings = get_settings(&app_handle_cloned);
                    let timeout_seconds = settings.model_unload_timeout.to_seconds();

                    if let Some(limit_seconds) = timeout_seconds {
                        // Skip polling-based unloading for immediate timeout since it's handled directly in transcribe()
                        if settings.model_unload_timeout == ModelUnloadTimeout::Immediately {
                            continue;
                        }

                        let last = manager_cloned.last_activity.load(Ordering::Relaxed);
                        let now_ms = SystemTime::now()
                            .duration_since(SystemTime::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64;

                        if now_ms.saturating_sub(last) > limit_seconds * 1000 {
                            // idle -> unload
                            if manager_cloned.is_model_loaded() {
                                let unload_start = std::time::Instant::now();
                                debug!("Starting to unload model due to inactivity");

                                if let Ok(()) = manager_cloned.unload_model() {
                                    let _ = app_handle_cloned.emit(
                                        "model-state-changed",
                                        ModelStateEvent {
                                            event_type: "unloaded".to_string(),
                                            model_id: None,
                                            model_name: None,
                                            error: None,
                                        },
                                    );
                                    let unload_duration = unload_start.elapsed();
                                    debug!(
                                        "Model unloaded due to inactivity (took {}ms)",
                                        unload_duration.as_millis()
                                    );
                                }
                            }
                        }
                    }
                }
                debug!("Idle watcher thread shutting down gracefully");
            });
            *manager.watcher_handle.lock().unwrap() = Some(handle);
        }

        Ok(manager)
    }

    pub fn is_model_loaded(&self) -> bool {
        let engine = self.engine.lock().unwrap();
        engine.is_some()
    }

    pub fn unload_model(&self) -> Result<()> {
        let unload_start = std::time::Instant::now();
        debug!("Starting to unload model");

        {
            let mut engine = self.engine.lock().unwrap();
            *engine = None; // Drop the engine to free memory
        }
        {
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = None;
        }

        // Emit unloaded event
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "unloaded".to_string(),
                model_id: None,
                model_name: None,
                error: None,
            },
        );

        let unload_duration = unload_start.elapsed();
        debug!(
            "Model unloaded manually (took {}ms)",
            unload_duration.as_millis()
        );
        Ok(())
    }

    /// Build a [`LoadedEngine`] from a model id. Shared between the main
    /// `load_model` path and the streaming-engine path so both honour the
    /// same model registry / engine-type contract.
    fn build_engine(&self, model_id: &str) -> Result<LoadedEngine> {
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
                let engine = WhisperEngine::load(&model_path).map_err(|e| {
                    anyhow::anyhow!("Failed to load whisper model {}: {}", model_id, e)
                })?;
                Ok(LoadedEngine::Whisper(engine))
            }
            EngineType::Parakeet => {
                let engine = ParakeetModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                    anyhow::anyhow!("Failed to load parakeet model {}: {}", model_id, e)
                })?;
                Ok(LoadedEngine::Parakeet(engine))
            }
            EngineType::Diarization => Err(anyhow::anyhow!(
                "Diarization models cannot be used for transcription"
            )),
        }
    }

    pub fn load_model(&self, model_id: &str) -> Result<()> {
        let load_start = std::time::Instant::now();
        debug!("Starting to load model: {}", model_id);

        let model_name = self
            .model_manager
            .get_model_info(model_id)
            .map(|m| m.name);

        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_started".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: None,
                error: None,
            },
        );

        let loaded_engine = match self.build_engine(model_id) {
            Ok(eng) => eng,
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

        {
            let mut engine = self.engine.lock().unwrap();
            *engine = Some(loaded_engine);
        }
        {
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = Some(model_id.to_string());
        }

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

    /// Load a (typically smaller) model into the streaming engine slot. Safe
    /// to call repeatedly with the same id — re-using the already-loaded
    /// engine. The streaming engine is never auto-unloaded by the idle
    /// watcher; the caller is responsible for [`unload_streaming_model`] on
    /// shutdown.
    pub fn load_streaming_model(&self, model_id: &str) -> Result<()> {
        {
            let current = self.streaming_model_id.lock().unwrap();
            if current.as_deref() == Some(model_id)
                && self.streaming_engine.lock().unwrap().is_some()
            {
                return Ok(());
            }
        }
        let load_start = std::time::Instant::now();
        let engine = self.build_engine(model_id)?;
        *self.streaming_engine.lock().unwrap() = Some(engine);
        *self.streaming_model_id.lock().unwrap() = Some(model_id.to_string());
        info!(
            "Streaming model loaded: {} ({}ms)",
            model_id,
            load_start.elapsed().as_millis()
        );
        Ok(())
    }

    pub fn unload_streaming_model(&self) {
        let mut engine = self.streaming_engine.lock().unwrap();
        if engine.is_some() {
            *engine = None;
            *self.streaming_model_id.lock().unwrap() = None;
            debug!("Streaming engine unloaded");
        }
    }

    /// Kicks off the model loading in a background thread if it's not already loaded
    pub fn initiate_model_load(&self) {
        let mut is_loading = self.is_loading.lock().unwrap();
        if *is_loading || self.is_model_loaded() {
            return;
        }

        *is_loading = true;
        let self_clone = self.clone();
        thread::spawn(move || {
            let settings = get_settings(&self_clone.app_handle);
            if let Err(e) = self_clone.load_model(&settings.selected_model) {
                error!("Failed to load model: {}", e);
            }
            let mut is_loading = self_clone.is_loading.lock().unwrap();
            *is_loading = false;
            self_clone.loading_condvar.notify_all();
        });
    }

    pub fn get_current_model(&self) -> Option<String> {
        let current_model = self.current_model_id.lock().unwrap();
        current_model.clone()
    }

    /// Increment the keepalive counter — while non-zero, transcribe() will
    /// NOT honor the `Immediately` model_unload_timeout setting after each
    /// call. Pair with [`release_keepalive`].
    pub fn acquire_keepalive(&self) {
        let prev = self.keepalive_users.fetch_add(1, Ordering::SeqCst);
        debug!("transcription keepalive acquired (now {})", prev + 1);
    }

    /// Counterpart to [`acquire_keepalive`].
    pub fn release_keepalive(&self) {
        let prev = self.keepalive_users.fetch_sub(1, Ordering::SeqCst);
        debug!("transcription keepalive released (now {})", prev.saturating_sub(1));
    }

    /// Same as [`transcribe`], but routes through the dedicated streaming
    /// engine (typically a smaller model than the batch one) and uses every
    /// available CPU thread. Falls back to the main engine if the streaming
    /// engine isn't loaded — preserves behaviour for callers that haven't
    /// opted into the dual-engine setup.
    pub fn transcribe_for_streaming(&self, audio: Vec<f32>) -> Result<String> {
        let n_threads = std::thread::available_parallelism()
            .map(|n| n.get() as i32)
            .unwrap_or(4);
        if self.streaming_engine.lock().unwrap().is_some() {
            return self.transcribe_with_engine(&self.streaming_engine, audio, Some(n_threads));
        }
        self.transcribe_inner(audio, Some(n_threads))
    }

    pub fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        self.transcribe_inner(audio, None)
    }

    /// Engine-agnostic decode. `engine_slot` is one of `self.engine` or
    /// `self.streaming_engine`. Does NOT honour the auto-unload / keepalive
    /// policy — those only make sense for the main engine.
    fn transcribe_with_engine(
        &self,
        engine_slot: &Arc<Mutex<Option<LoadedEngine>>>,
        audio: Vec<f32>,
        n_threads_override: Option<i32>,
    ) -> Result<String> {
        if audio.is_empty() {
            return Ok(String::new());
        }
        let settings = get_settings(&self.app_handle);
        let st = std::time::Instant::now();
        let result = {
            let mut engine_guard = engine_slot.lock().unwrap();
            let engine = engine_guard
                .as_mut()
                .ok_or_else(|| anyhow::anyhow!("Streaming engine not loaded"))?;
            match engine {
                LoadedEngine::Whisper(whisper_engine) => {
                    let whisper_language = if settings.selected_language == "auto" {
                        None
                    } else {
                        let normalized = if matches!(
                            settings.selected_language.as_str(),
                            "zh-Hans" | "zh-Hant"
                        ) {
                            "zh".to_string()
                        } else {
                            settings.selected_language.clone()
                        };
                        Some(normalized)
                    };
                    let params = WhisperInferenceParams {
                        language: whisper_language,
                        translate: settings.translate_to_english,
                        n_threads: n_threads_override.unwrap_or(0),
                        ..Default::default()
                    };
                    whisper_engine
                        .transcribe_with(&audio, &params)
                        .map_err(|e| anyhow::anyhow!("Whisper transcription failed: {}", e))?
                }
                LoadedEngine::Parakeet(parakeet_engine) => {
                    let params = ParakeetParams {
                        timestamp_granularity: Some(TimestampGranularity::Segment),
                        ..Default::default()
                    };
                    parakeet_engine
                        .transcribe_with(&audio, &params)
                        .map_err(|e| anyhow::anyhow!("Parakeet transcription failed: {}", e))?
                }
            }
        };

        let corrected = if settings.custom_words.is_empty() {
            result.text
        } else {
            apply_custom_words(
                &result.text,
                &settings.custom_words,
                settings.word_correction_threshold,
            )
        };
        debug!(
            "Streaming decode in {}ms",
            st.elapsed().as_millis()
        );
        Ok(corrected.trim().to_string())
    }

    fn transcribe_inner(&self, audio: Vec<f32>, n_threads_override: Option<i32>) -> Result<String> {
        // Update last activity timestamp
        self.last_activity.store(
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            Ordering::Relaxed,
        );

        let st = std::time::Instant::now();

        debug!("Audio vector length: {}", audio.len());

        if audio.len() == 0 {
            debug!("Empty audio vector");
            return Ok(String::new());
        }

        // Check if model is loaded, if not try to load it
        {
            // If the model is loading, wait for it to complete.
            let mut is_loading = self.is_loading.lock().unwrap();
            while *is_loading {
                is_loading = self.loading_condvar.wait(is_loading).unwrap();
            }

            let engine_guard = self.engine.lock().unwrap();
            if engine_guard.is_none() {
                return Err(anyhow::anyhow!("Model is not loaded for transcription."));
            }
        }

        // Get current settings for configuration
        let settings = get_settings(&self.app_handle);

        // Perform transcription with the appropriate engine
        let result = {
            let mut engine_guard = self.engine.lock().unwrap();
            let engine = engine_guard.as_mut().ok_or_else(|| {
                anyhow::anyhow!(
                    "Model failed to load after auto-load attempt. Please check your model settings."
                )
            })?;

            match engine {
                LoadedEngine::Whisper(whisper_engine) => {
                    let whisper_language = if settings.selected_language == "auto" {
                        None
                    } else {
                        let normalized =
                            if matches!(settings.selected_language.as_str(), "zh-Hans" | "zh-Hant")
                            {
                                "zh".to_string()
                            } else {
                                settings.selected_language.clone()
                            };
                        Some(normalized)
                    };

                    let params = WhisperInferenceParams {
                        language: whisper_language,
                        translate: settings.translate_to_english,
                        n_threads: n_threads_override.unwrap_or(0),
                        ..Default::default()
                    };

                    whisper_engine
                        .transcribe_with(&audio, &params)
                        .map_err(|e| anyhow::anyhow!("Whisper transcription failed: {}", e))?
                }
                LoadedEngine::Parakeet(parakeet_engine) => {
                    let params = ParakeetParams {
                        timestamp_granularity: Some(TimestampGranularity::Segment),
                        ..Default::default()
                    };

                    parakeet_engine
                        .transcribe_with(&audio, &params)
                        .map_err(|e| anyhow::anyhow!("Parakeet transcription failed: {}", e))?
                }
            }
        };

        // Apply word correction if custom words are configured
        let corrected_result = if !settings.custom_words.is_empty() {
            apply_custom_words(
                &result.text,
                &settings.custom_words,
                settings.word_correction_threshold,
            )
        } else {
            result.text
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

        // Check if we should immediately unload the model after transcription.
        // Suppressed while a long-lived keepalive is held (e.g. by the
        // realtime streaming worker) — otherwise every interim decode would
        // pay a full reload cost.
        if settings.model_unload_timeout == ModelUnloadTimeout::Immediately
            && self.keepalive_users.load(Ordering::Relaxed) == 0
        {
            info!("Immediately unloading model after transcription");
            if let Err(e) = self.unload_model() {
                error!("Failed to immediately unload model: {}", e);
            }
        }

        Ok(corrected_result.trim().to_string())
    }
    pub fn start_streaming(&self, generation: u64) {
        debug!("start_streaming called - clearing buffer and resetting adaptive limit");
        self.active_generation.store(generation, Ordering::SeqCst);
        let mut buf = self.streaming_buffer.lock().unwrap();
        buf.clear();
        *self.last_partial_update.lock().unwrap() = std::time::Instant::now();
        // Reset adaptive limit for new recording session
        *self.adaptive_max_samples.lock().unwrap() = None;
    }

    pub fn handle_streaming_chunk(&self, chunk: Vec<f32>, generation: u64) {
        // Discard chunk if it belongs to a stale recording session
        if self.active_generation.load(Ordering::SeqCst) != generation {
            return;
        }

        // Append chunk to buffer
        let current_len = {
            let mut buf = self.streaming_buffer.lock().unwrap();
            buf.extend_from_slice(&chunk);
            buf.len()
        };

        // Throttle updates to ~500ms
        let now = std::time::Instant::now();
        let mut last = self.last_partial_update.lock().unwrap();
        let elapsed_ms = now.duration_since(*last).as_millis();

        if elapsed_ms > 500 {
            *last = now;
            drop(last);

            // Avoid transcribing extremely short buffers (need at least 1 second)
            if current_len < 16000 {
                return;
            }

            // Skip if a streaming transcription is already in progress
            // This prevents parallel transcriptions and resource waste
            if self.streaming_in_progress.swap(true, Ordering::SeqCst) {
                debug!("Skipping streaming transcription - previous one still in progress");
                return;
            }

            // Adaptive streaming: adjust max samples based on transcription performance
            // Target: keep transcription time under 800ms for responsive UI
            // Minimum: 5 seconds of audio for context (16000 * 5 = 80000 samples)
            const MIN_STREAMING_SAMPLES: usize = 16000 * 5;
            const TARGET_TRANSCRIPTION_MS: u128 = 800;

            let adaptive_limit = *self.adaptive_max_samples.lock().unwrap();

            // Get buffer to transcribe (limited by adaptive window)
            let buf_to_transcribe = {
                let buf = self.streaming_buffer.lock().unwrap();
                match adaptive_limit {
                    Some(max_samples) if buf.len() > max_samples => {
                        // Sliding window - only transcribe last X samples
                        buf[buf.len() - max_samples..].to_vec()
                    }
                    _ => {
                        // No limit yet, transcribe full buffer
                        buf.clone()
                    }
                }
            };

            // Calculate audio duration for logging
            let audio_duration_secs = buf_to_transcribe.len() as f32 / 16000.0;
            let samples_count = buf_to_transcribe.len();

            let this = self.clone();

            thread::spawn(move || {
                // Check generation before starting transcription work
                if this.active_generation.load(Ordering::SeqCst) != generation {
                    this.streaming_in_progress.store(false, Ordering::SeqCst);
                    return;
                }

                let transcription_start = std::time::Instant::now();
                if let Ok(text) = this.transcribe(buf_to_transcribe) {
                    let transcription_ms = transcription_start.elapsed().as_millis();

                    info!(
                        "Partial transcription ({:.1}s audio, {}ms): '{}'",
                        audio_duration_secs, transcription_ms, text
                    );

                    // Adaptive algorithm: if transcription exceeded target time, reduce the limit
                    if transcription_ms > TARGET_TRANSCRIPTION_MS {
                        let mut adaptive = this.adaptive_max_samples.lock().unwrap();

                        match *adaptive {
                            None => {
                                // First time exceeding: set limit to current sample count
                                let new_limit = samples_count.max(MIN_STREAMING_SAMPLES);
                                info!(
                                    "Adaptive limit set: {:.1}s ({}ms exceeded {}ms target)",
                                    new_limit as f32 / 16000.0,
                                    transcription_ms,
                                    TARGET_TRANSCRIPTION_MS
                                );
                                *adaptive = Some(new_limit);
                            }
                            Some(current) => {
                                // Already have a limit but still exceeding: reduce by 10%
                                let reduced = (current as f32 * 0.9) as usize;
                                let new_limit = reduced.max(MIN_STREAMING_SAMPLES);

                                if new_limit < current {
                                    info!(
                                        "Adaptive limit reduced: {:.1}s -> {:.1}s ({}ms still exceeded {}ms)",
                                        current as f32 / 16000.0,
                                        new_limit as f32 / 16000.0,
                                        transcription_ms,
                                        TARGET_TRANSCRIPTION_MS
                                    );
                                    *adaptive = Some(new_limit);
                                }
                            }
                        }
                    }

                    // Only emit if this generation is still current
                    if this.active_generation.load(Ordering::SeqCst) == generation {
                        crate::overlay::emit_transcription_progress(&this.app_handle, &text);
                    }
                }
                // Mark streaming transcription as complete
                this.streaming_in_progress.store(false, Ordering::SeqCst);
            });
        }
    }
}

impl Drop for TranscriptionManager {
    fn drop(&mut self) {
        debug!("Shutting down TranscriptionManager");

        // Signal the watcher thread to shutdown
        self.shutdown_signal.store(true, Ordering::Relaxed);

        // Wait for the thread to finish gracefully
        if let Some(handle) = self.watcher_handle.lock().unwrap().take() {
            if let Err(e) = handle.join() {
                warn!("Failed to join idle watcher thread: {:?}", e);
            } else {
                debug!("Idle watcher thread joined successfully");
            }
        }
    }
}
