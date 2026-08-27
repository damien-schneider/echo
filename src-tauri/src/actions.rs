use crate::audio_feedback::{play_feedback_sound, play_feedback_sound_blocking, SoundType};
use crate::features::polish::manager::PolishManager;
use crate::managers::audio::{AudioRecordingManager, RecordedDictation, RecordingAttempt};
use crate::managers::history::HistoryManager;
use crate::managers::transcription::{
    transcription_timeout, TranscribeError, TranscriptionManager,
};
use crate::managers::tts::TtsManager;
use crate::overlay::{show_recording_overlay, show_transcribing_overlay, show_warning_overlay};
use crate::settings::{get_settings, AppSettings};
use crate::tray::{change_tray_icon, TrayIconState};
use crate::utils;
use crate::ManagedToggleState;
use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use log::{debug, error, info, warn};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::time::Instant;
use tauri::AppHandle;
use tauri::{Emitter, Manager};

/// Input to pure [`decide_end_of_recording`].
#[derive(Debug, Clone)]
pub struct TranscribedText {
    pub cleaned: String,
    /// Set only for zh-Hans/zh-Hant via OpenCC.
    pub chinese_variant: Option<String>,
}

#[derive(Debug)]
pub enum EndOfRecordingAction {
    /// Frontend AI-SDK post-processes via `transcription-ready` event.
    PostProcess(String),
    /// Skip LLM. `pasted` is the zh variant; `cleaned` is the pre-conversion text kept for history.
    PasteDirect {
        cleaned: String,
        pasted: String,
    },
    NothingToPaste,
    ShowError(String),
}

#[allow(clippy::too_many_arguments)]
async fn apply_end_of_recording_action(
    ah: AppHandle,
    action: EndOfRecordingAction,
    gen: u64,
    samples: Vec<f32>,
    hm: Arc<HistoryManager>,
    tts_manager: Arc<TtsManager>,
) {
    match action {
        EndOfRecordingAction::NothingToPaste => {
            crate::dictation::abandon(&ah);
            if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                utils::hide_recording_overlay(&ah);
                change_tray_icon(&ah, TrayIconState::Idle);
            }
        }
        EndOfRecordingAction::ShowError(message) => {
            error!("Transcription stop ended with error: {message}");
            crate::dictation::abandon(&ah);
            // Never leave UI stuck on "transcribing".
            if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                show_warning_overlay(&ah, &message);
                change_tray_icon(&ah, TrayIconState::Idle);
            }
        }
        EndOfRecordingAction::PasteDirect { cleaned, pasted } => {
            let settings = get_settings(&ah);
            if settings.tts_enabled {
                let tts_clone = tts_manager.clone();
                let text_to_speak = pasted.clone();
                info!("Triggering TTS with text: {}", text_to_speak);
                std::thread::spawn(move || {
                    if let Err(e) = tts_clone.speak(&text_to_speak) {
                        error!("TTS failed: {}", e);
                    }
                });
            }
            let hm_clone = Arc::clone(&hm);
            let pasted_for_history = pasted.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = hm_clone
                    .save_transcription(samples, cleaned, Some(pasted_for_history), None)
                    .await
                {
                    error!("Failed to save transcription to history: {}", e);
                }
            });

            if OPERATION_GENERATION.load(Ordering::SeqCst) != gen {
                debug!("Operation became stale before paste, skipping");
                return;
            }
            deliver_transcript(&ah, pasted, gen);
        }
        EndOfRecordingAction::PostProcess(transcription) => {
            // Samples stay in Rust — a JSON round-trip of the raw buffer costs ~12 bytes per sample.
            stash_pending_audio(gen, samples);
            // Watchdog guards against frontend hang/throw skipping finalize.
            let payload = serde_json::json!({
                "transcription": transcription.clone(),
                "op_generation": gen,
            });
            match ah.emit("transcription-ready", payload) {
                Ok(()) => {
                    arm_finalize_watchdog(ah.clone(), gen, transcription);
                }
                Err(e) => {
                    // No listener: paste raw, no finalize coming.
                    error!("Failed to emit transcription-ready: {}", e);
                    if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
                        deliver_transcript(&ah, transcription, gen);
                    }
                }
            }
        }
    }
}

/// The one exit every dictation takes, wherever the text came from — staleness-checked against `gen`.
pub(crate) fn deliver_transcript(ah: &AppHandle, text: String, gen: u64) {
    let ah_clone = ah.clone();
    let scheduled = ah.run_on_main_thread(move || {
        if OPERATION_GENERATION.load(Ordering::SeqCst) != gen {
            return;
        }
        utils::hide_recording_overlay(&ah_clone);
        crate::dictation::deliver(&ah_clone, text);
        change_tray_icon(&ah_clone, TrayIconState::Idle);
    });
    if let Err(error) = scheduled {
        error!("Failed to deliver the transcription: {error:?}");
        if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
            utils::hide_recording_overlay(ah);
            change_tray_icon(ah, TrayIconState::Idle);
        }
    }
}

/// Recovers overlay if frontend never calls finalize_transcription.
fn arm_finalize_watchdog(ah: AppHandle, gen: u64, raw: String) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(POST_PROCESS_WATCHDOG).await;
        if OPERATION_GENERATION.load(Ordering::SeqCst) != gen {
            return;
        }
        if FINALIZE_DONE.load(Ordering::SeqCst) == gen {
            return;
        }
        warn!(
            "Post-process watchdog firing: frontend never called finalize_transcription \
             for generation {gen} within {:?}. Falling back to raw paste.",
            POST_PROCESS_WATCHDOG
        );
        deliver_transcript(&ah, raw, gen);
    });
}

/// Short-circuits silent press+release to avoid a pointless decode on pure zeros.
pub fn audio_is_silent(samples: &[f32]) -> bool {
    use crate::managers::meeting_streaming::{rms, SILENCE_RMS_THRESHOLD};
    rms(samples) < SILENCE_RMS_THRESHOLD
}

pub fn transcribe_recording<F>(
    recording: &RecordedDictation,
    language_is_automatic: bool,
    batch_decode: F,
) -> Result<String, TranscribeError>
where
    F: FnOnce(&[f32]) -> Result<String, TranscribeError>,
{
    let streaming_transcript = recording
        .streaming_transcript
        .as_deref()
        .filter(|transcript| !transcript.trim().is_empty());
    if !language_is_automatic && !recording.had_long_pause {
        if let Some(transcript) = streaming_transcript {
            return Ok(transcript.to_owned());
        }
    }
    if audio_is_silent(&recording.samples) {
        return Ok(String::new());
    }
    match batch_decode(&recording.samples) {
        Ok(batch_transcript) if !batch_transcript.trim().is_empty() => Ok(batch_transcript),
        Ok(batch_transcript) => match streaming_transcript {
            Some(transcript) => Ok(transcript.to_owned()),
            None => Ok(batch_transcript),
        },
        Err(error) => match streaming_transcript {
            Some(transcript) => Ok(transcript.to_owned()),
            None => Err(error),
        },
    }
}

const BLANK_AUDIO_MARKER: &str = "[BLANK_AUDIO]";

pub(crate) fn sanitize_dictation_output(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut remaining = text;

    while let Some(marker_start) = remaining.find(BLANK_AUDIO_MARKER) {
        let marker_end = marker_start + BLANK_AUDIO_MARKER.len();
        let before = &remaining[..marker_start];
        let after = &remaining[marker_end..];
        let is_embedded = before
            .chars()
            .next_back()
            .is_some_and(is_identifier_character)
            && after.chars().next().is_some_and(is_identifier_character);

        if is_embedded {
            output.push_str(&remaining[..marker_end]);
            remaining = after;
            continue;
        }

        output.push_str(before);
        remaining = after;
        if output
            .chars()
            .next_back()
            .is_some_and(is_horizontal_whitespace)
        {
            remaining = remaining.trim_start_matches(is_horizontal_whitespace);
        }
    }

    output.push_str(remaining);
    output.trim().to_string()
}

fn is_identifier_character(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}

fn is_horizontal_whitespace(character: char) -> bool {
    matches!(character, ' ' | '\t')
}

pub fn decide_end_of_recording(
    samples_present: bool,
    transcribe_outcome: Result<TranscribedText, TranscribeError>,
) -> EndOfRecordingAction {
    if !samples_present {
        return EndOfRecordingAction::NothingToPaste;
    }
    match transcribe_outcome {
        Err(TranscribeError::TimedOut) => EndOfRecordingAction::ShowError(
            "Transcription timeout: the local model did not respond. Try again.".to_string(),
        ),
        Err(TranscribeError::Failed(msg)) => {
            EndOfRecordingAction::ShowError(format!("Transcription failed: {msg}"))
        }
        Ok(t) => {
            let cleaned = sanitize_dictation_output(&t.cleaned);
            if cleaned.is_empty() {
                return EndOfRecordingAction::NothingToPaste;
            }
            match t.chinese_variant {
                Some(variant) => EndOfRecordingAction::PasteDirect {
                    cleaned,
                    pasted: sanitize_dictation_output(&variant),
                },
                None => EndOfRecordingAction::PostProcess(cleaned),
            }
        }
    }
}

pub fn apply_post_process_preference(
    action: EndOfRecordingAction,
    post_process_enabled: bool,
) -> EndOfRecordingAction {
    match action {
        EndOfRecordingAction::PostProcess(text) if !post_process_enabled => {
            EndOfRecordingAction::PasteDirect {
                cleaned: text.clone(),
                pasted: text,
            }
        }
        action => action,
    }
}

/// Bumps on every accepted start, stop, or cancel so stale work cannot mutate UI.
pub(crate) static OPERATION_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Set by voice_tools::finalize_transcription on every exit path.
pub static FINALIZE_DONE: AtomicU64 = AtomicU64::new(0);

/// Recorded audio waiting for `finalize_transcription`, kept here instead of sent through the webview.
/// Holds one dictation at most: a new stash replaces the previous, so an abandoned round-trip cannot pile up.
static PENDING_DICTATION_AUDIO: Lazy<Mutex<Option<PendingDictationAudio>>> =
    Lazy::new(|| Mutex::new(None));

struct PendingDictationAudio {
    generation: u64,
    samples: Vec<f32>,
}

fn stash_pending_audio(generation: u64, samples: Vec<f32>) {
    if let Ok(mut pending) = PENDING_DICTATION_AUDIO.lock() {
        *pending = Some(PendingDictationAudio {
            generation,
            samples,
        });
    }
}

/// Takes the stash unconditionally — the slot only ever holds the newest dictation, and leaving a
/// mismatched buffer behind would pin it until the next recording.
pub(crate) fn take_pending_audio(generation: u64) -> Vec<f32> {
    let Ok(mut pending) = PENDING_DICTATION_AUDIO.lock() else {
        return Vec::new();
    };
    match pending.take() {
        Some(pending) if pending.generation == generation => pending.samples,
        _ => Vec::new(),
    }
}

pub const POST_PROCESS_WATCHDOG: Duration = Duration::from_secs(30);

/// Last resort above the inner per-join budgets (~3s) — past it the audio path is abandoned so the UI can't stick.
pub const STOP_RECORDING_CEILING: Duration = Duration::from_secs(10);

/// Aborted on new stop/cancel to halt stale LLM post-process calls.
pub(crate) static TRANSCRIPTION_TASK: Lazy<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>> =
    Lazy::new(|| Mutex::new(None));

pub trait ShortcutAction: Send + Sync {
    fn is_one_shot(&self) -> bool {
        false
    }

    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
}

struct TranscribeAction;

struct StartFeedback {
    app: AppHandle,
    attempt: RecordingAttempt,
    delay: Duration,
    generation: u64,
    recording: Arc<AudioRecordingManager>,
}

fn should_apply_start_feedback(
    current_generation: u64,
    expected_generation: u64,
    is_attempt_active: bool,
) -> bool {
    is_current_operation(current_generation, expected_generation) && is_attempt_active
}

fn is_current_operation(current_generation: u64, expected_generation: u64) -> bool {
    current_generation == expected_generation
}

fn reset_failed_start(app: &AppHandle, binding_id: &str, generation: u64) {
    if !is_current_operation(OPERATION_GENERATION.load(Ordering::SeqCst), generation) {
        return;
    }
    let toggle_state_manager = app.state::<ManagedToggleState>();
    if let Ok(mut states) = toggle_state_manager.lock() {
        states.active_toggles.insert(binding_id.to_string(), false);
    }
    utils::hide_recording_overlay(app);
    change_tray_icon(app, TrayIconState::Idle);
}

impl StartFeedback {
    fn spawn(self) {
        std::thread::spawn(move || {
            std::thread::sleep(self.delay);
            let current_generation = OPERATION_GENERATION.load(Ordering::SeqCst);
            if !should_apply_start_feedback(
                current_generation,
                self.generation,
                self.recording.is_attempt_active(self.attempt),
            ) {
                return;
            }
            play_feedback_sound_blocking(&self.app, SoundType::Start);
            let current_generation = OPERATION_GENERATION.load(Ordering::SeqCst);
            if is_current_operation(current_generation, self.generation) {
                self.recording.apply_mute_if_active(self.attempt);
            }
        });
    }
}

async fn maybe_convert_chinese_variant(
    settings: &AppSettings,
    transcription: &str,
) -> Option<String> {
    let is_simplified = settings.selected_language == "zh-Hans";
    let is_traditional = settings.selected_language == "zh-Hant";

    if !is_simplified && !is_traditional {
        debug!("selected_language is not Simplified or Traditional Chinese; skipping conversion");
        return None;
    }

    debug!(
        "Starting Chinese variant conversion for language: {}",
        settings.selected_language
    );

    let config = if is_simplified {
        BuiltinConfig::Tw2sp
    } else {
        BuiltinConfig::S2twp
    };

    match OpenCC::from_config(config) {
        Ok(converter) => {
            let converted = converter.convert(transcription);
            debug!(
                "OpenCC conversion completed. Input length: {}, Output length: {}",
                transcription.len(),
                converted.len()
            );
            Some(converted)
        }
        Err(e) => {
            error!(
                "Failed to initialize OpenCC converter: {}. Falling back to original transcription.",
                e
            );
            None
        }
    }
}

/// Returns "" for whisper hallucinations, raw if cleanup off/unloaded, else cleaned.
fn apply_dictation_cleanup(app: &AppHandle, raw: &str, settings: &AppSettings) -> String {
    use crate::commands::cleanup::{build_context_from_app_settings, CleanupState};
    use crate::managers::cleanup_apply::cleanup_or_filter;

    let cleanup_state = match app.try_state::<CleanupState>() {
        Some(s) => s.inner().clone(),
        None => {
            // Test harness / early boot: pass through but still filter hallucinations.
            return if crate::managers::meeting_streaming::is_whisper_hallucination(raw) {
                String::new()
            } else {
                raw.to_string()
            };
        }
    };
    cleanup_or_filter(raw, &cleanup_state, settings, || {
        build_context_from_app_settings(settings)
    })
}

/// Outcome of the pre-flight model check run before a dictation starts.
pub(crate) enum ModelReadiness {
    /// Downloaded; the decode path loads it if needed.
    Ready,
    /// Cannot record right now; show `String` and abort the press.
    Blocked(String),
    /// Model is downloading; show `String` and abort the press.
    Downloading(String),
}

fn model_readiness_for_status(
    name: &str,
    is_downloaded: bool,
    is_downloading: bool,
) -> ModelReadiness {
    if is_downloaded {
        return ModelReadiness::Ready;
    }
    if is_downloading {
        return ModelReadiness::Downloading(format!("Downloading the {name} model…"));
    }
    ModelReadiness::Blocked(format!(
        "Download the {name} model in Settings before recording."
    ))
}

pub(crate) fn check_model_readiness(app: &AppHandle) -> ModelReadiness {
    use crate::managers::model::{transcription_profile_id, ModelManager};

    let settings = get_settings(app);
    let model_id = transcription_profile_id(settings.transcription_model_size);

    let model_manager = app.state::<Arc<ModelManager>>();
    match model_manager.get_model_info(model_id) {
        None => ModelReadiness::Blocked(format!(
            "The {model_id} model is unavailable. Check Settings."
        )),
        Some(info) => {
            model_readiness_for_status(&info.name, info.is_downloaded, info.is_downloading)
        }
    }
}

impl TranscribeAction {
    /// A dictation without microphone access only records silence — resolve access before capture.
    fn ensure_microphone_access(&self, app: &AppHandle, binding_id: &str) -> bool {
        use tauri_plugin_macos_permissions as macos_permissions;

        let status = crate::commands::audio::microphone_permission_status();
        if status == "authorized" {
            return true;
        }
        warn!("Dictation blocked: microphone access is {status}");
        show_warning_overlay(app, "Allow microphone access in the dialog to dictate");

        let app_handle = app.clone();
        let binding = binding_id.to_string();
        std::thread::spawn(move || {
            if status == "denied" {
                use tauri_plugin_opener::OpenerExt;
                let _ = app_handle.opener().open_url(
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
                    None::<String>,
                );
                show_warning_overlay(
                    &app_handle,
                    "Microphone is off — enable it in System Settings",
                );
                return;
            }
            let _ =
                tauri::async_runtime::block_on(macos_permissions::request_microphone_permission());
            let mut granted =
                tauri::async_runtime::block_on(macos_permissions::check_microphone_permission());
            for _ in 0..59 {
                if granted {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
                granted = tauri::async_runtime::block_on(
                    macos_permissions::check_microphone_permission(),
                );
            }
            if granted {
                info!("Microphone access granted — restarting dictation");
                TranscribeAction.start(&app_handle, &binding, "");
            } else {
                use tauri_plugin_opener::OpenerExt;
                let _ = app_handle.opener().open_url(
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
                    None::<String>,
                );
                show_warning_overlay(
                    &app_handle,
                    "Microphone is off for Echo — enable it in System Settings",
                );
            }
        });
        false
    }
}

impl ShortcutAction for TranscribeAction {
    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let start_time = Instant::now();
        debug!("TranscribeAction::start called for binding: {}", binding_id);
        crate::dictation::begin(binding_id);

        if crate::is_file_transcription_active() {
            debug!("File transcription in progress - showing warning overlay");
            show_warning_overlay(app, "File transcription in progress. Please wait...");

            let toggle_state_manager = app.state::<ManagedToggleState>();
            if let Ok(mut states) = toggle_state_manager.lock() {
                states.active_toggles.insert(binding_id.to_string(), false);
            }
            return;
        }

        // Recording without a model only fails later after capturing audio.
        match check_model_readiness(app) {
            ModelReadiness::Ready => {}
            ModelReadiness::Blocked(message) | ModelReadiness::Downloading(message) => {
                warn!("Dictation not started: {message}");
                show_warning_overlay(app, &message);
                let toggle_state_manager = app.state::<ManagedToggleState>();
                if let Ok(mut states) = toggle_state_manager.lock() {
                    states.active_toggles.insert(binding_id.to_string(), false);
                }
                return;
            }
        }

        // Recording without microphone access only captures silence.
        if !self.ensure_microphone_access(app, binding_id) {
            let toggle_state_manager = app.state::<ManagedToggleState>();
            if let Ok(mut states) = toggle_state_manager.lock() {
                states.active_toggles.insert(binding_id.to_string(), false);
            }
            return;
        }

        let tm = app.state::<Arc<TranscriptionManager>>();
        tm.initiate_model_load();

        let binding_id = binding_id.to_string();
        let rm = app.state::<Arc<AudioRecordingManager>>();
        let Some(attempt) = rm.reserve_start(&binding_id, || {
            OPERATION_GENERATION
                .fetch_add(1, Ordering::SeqCst)
                .wrapping_add(1)
        }) else {
            warn!("Dictation not started: another recording is active");
            let toggle_state_manager = app.state::<ManagedToggleState>();
            if let Ok(mut states) = toggle_state_manager.lock() {
                states.active_toggles.insert(binding_id, false);
            }
            return;
        };
        let generation = attempt.operation_generation();
        change_tray_icon(app, TrayIconState::Recording);
        if !crate::dictation::routes_to_chat() {
            show_recording_overlay(app);
        }
        info!(
            "start: overlay show requested at +{:?} (on shortcut callback thread)",
            start_time.elapsed()
        );

        let settings = get_settings(app);
        let is_always_on = settings.always_on_microphone;
        debug!("Microphone mode - always_on: {}", is_always_on);

        if is_always_on {
            let recording_started = rm.start_reserved_recording(&binding_id, attempt);
            if !recording_started {
                reset_failed_start(app, &binding_id, generation);
            } else {
                StartFeedback {
                    app: app.clone(),
                    attempt,
                    delay: Duration::ZERO,
                    generation,
                    recording: Arc::clone(&rm),
                }
                .spawn();
            }
            debug!("Recording started: {}", recording_started);
        } else {
            // Opening the on-demand microphone off-thread keeps the HUD responsive.
            debug!("On-demand mode: starting recording off the shortcut thread");
            let app_clone = app.clone();
            let rm_clone = Arc::clone(&rm);
            let bid = binding_id.clone();
            std::thread::spawn(move || {
                let recording_start_time = Instant::now();
                if rm_clone.start_reserved_recording(&bid, attempt) {
                    info!(
                        "start: try_start_recording (mic open + worker) took {:?} (off-thread)",
                        recording_start_time.elapsed()
                    );
                    StartFeedback {
                        app: app_clone,
                        attempt,
                        delay: Duration::from_millis(100),
                        generation,
                        recording: rm_clone,
                    }
                    .spawn();
                } else {
                    reset_failed_start(&app_clone, &bid, generation);
                    debug!("Failed to start recording");
                }
            });
        }

        debug!(
            "TranscribeAction::start completed in {:?}",
            start_time.elapsed()
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let stop_time = Instant::now();
        debug!("TranscribeAction::stop called for binding: {}", binding_id);
        let ah = app.clone();
        let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
        let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
        let hm = Arc::clone(&app.state::<Arc<HistoryManager>>());
        let tts_manager = Arc::clone(&app.state::<Arc<TtsManager>>());
        let Some(recording_stop) = rm.claim_stop(binding_id) else {
            warn!("Recording stop ignored: no matching active attempt");
            return;
        };
        let gen = OPERATION_GENERATION
            .fetch_add(1, Ordering::SeqCst)
            .wrapping_add(1);

        change_tray_icon(app, TrayIconState::Transcribing);
        if !crate::dictation::routes_to_chat() {
            show_transcribing_overlay(app);
        }

        // Unmute first so stop sound is audible.
        rm.remove_mute();

        play_feedback_sound(app, SoundType::Stop);

        let binding_id = binding_id.to_string();
        let rm_for_task = Arc::clone(&rm);

        if let Ok(mut task) = TRANSCRIPTION_TASK.lock() {
            if let Some(handle) = task.take() {
                handle.abort();
            }
        }

        let handle = tauri::async_runtime::spawn(async move {
            let binding_id = binding_id.clone();
            debug!(
                "Starting async transcription task for binding: {}",
                binding_id
            );

            // `stop_recording` blocks on OS joins — the blocking pool keeps an `.await` boundary so abort still works
            let stop_recording_time = Instant::now();
            let rm_stop = Arc::clone(&rm_for_task);
            let bid = binding_id.clone();
            let recording_opt = match tokio::time::timeout(
                STOP_RECORDING_CEILING,
                tauri::async_runtime::spawn_blocking(move || {
                    rm_stop.stop_recording(&bid, recording_stop)
                }),
            )
            .await
            {
                Ok(Ok(opt)) => opt,
                Ok(Err(join_err)) => {
                    error!("stop_recording task panicked: {join_err}");
                    // Fail fast through the error path rather than hanging.
                    apply_end_of_recording_action(
                        ah,
                        EndOfRecordingAction::ShowError(
                            "Recording stopped unexpectedly — please try again.".to_string(),
                        ),
                        gen,
                        Vec::new(),
                        hm,
                        tts_manager,
                    )
                    .await;
                    return;
                }
                Err(_) => {
                    error!(
                        "stop_recording exceeded {:?} — audio teardown wedged; \
                         forcing error path",
                        STOP_RECORDING_CEILING
                    );
                    apply_end_of_recording_action(
                        ah,
                        EndOfRecordingAction::ShowError(
                            "Recording stop timed out — please try again.".to_string(),
                        ),
                        gen,
                        Vec::new(),
                        hm,
                        tts_manager,
                    )
                    .await;
                    return;
                }
            };
            let samples_present = recording_opt.is_some();
            let recording = recording_opt.unwrap_or(RecordedDictation {
                had_long_pause: false,
                samples: Vec::new(),
                streaming_transcript: None,
            });
            info!(
                "stop: stop_recording returned in {:?} — {} samples ({:.1}s audio), present={}",
                stop_recording_time.elapsed(),
                recording.samples.len(),
                recording.samples.len() as f32 / 16000.0,
                samples_present
            );

            let outcome: Result<TranscribedText, TranscribeError> = if !samples_present {
                Ok(TranscribedText {
                    cleaned: String::new(),
                    chinese_variant: None,
                })
            } else {
                let settings = get_settings(&ah);
                let raw_result = transcribe_recording(
                    &recording,
                    settings.selected_language == "auto",
                    |samples_for_decode| {
                        let timeout = transcription_timeout(samples_for_decode.len());
                        info!(
                            "stop: quality batch decoding {} recorded samples",
                            samples_for_decode.len()
                        );
                        tm.transcribe_with_timeout(samples_for_decode.to_vec(), timeout)
                    },
                );
                match raw_result {
                    Ok(text) => {
                        info!("stop: transcript ready ({} chars)", text.len());
                        let cleaned = apply_dictation_cleanup(&ah, &text, &settings);
                        let chinese_variant = if cleaned.is_empty() {
                            None
                        } else {
                            maybe_convert_chinese_variant(&settings, &cleaned).await
                        };
                        Ok(TranscribedText {
                            cleaned,
                            chinese_variant,
                        })
                    }
                    Err(e) => {
                        info!("stop: transcription failed: {e}");
                        Err(e)
                    }
                }
            };

            let action = decide_end_of_recording(samples_present, outcome);
            let action =
                apply_post_process_preference(action, get_settings(&ah).post_process_enabled);
            // Moved, never cloned — the buffer is the largest allocation a dictation makes.
            apply_end_of_recording_action(ah, action, gen, recording.samples, hm, tts_manager)
                .await;
        });

        if let Ok(mut task) = TRANSCRIPTION_TASK.lock() {
            *task = Some(handle);
        }

        debug!(
            "TranscribeAction::stop completed in {:?}",
            stop_time.elapsed()
        );
    }
}

struct TestAction;

struct PolishAction;

impl ShortcutAction for PolishAction {
    fn is_one_shot(&self) -> bool {
        true
    }

    fn start(&self, app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        let manager = app.state::<Arc<PolishManager>>().inner().clone();
        let generation = manager.begin();
        tauri::async_runtime::spawn(async move {
            manager.run(generation).await;
        });
    }

    fn stop(&self, _app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {}
}

impl ShortcutAction for TestAction {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Started - {} (App: {})",
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Stopped - {} (App: {})",
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }
}

pub static ACTION_MAP: Lazy<HashMap<String, Arc<dyn ShortcutAction>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(
        "transcribe".to_string(),
        Arc::new(TranscribeAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "test".to_string(),
        Arc::new(TestAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "polish".to_string(),
        Arc::new(PolishAction) as Arc<dyn ShortcutAction>,
    );
    map
});

#[cfg(test)]
mod decision_tests {
    use super::{
        apply_post_process_preference, decide_end_of_recording, is_current_operation,
        should_apply_start_feedback, transcribe_recording, EndOfRecordingAction, TranscribedText,
    };
    use crate::managers::audio::RecordedDictation;
    use crate::managers::transcription::TranscribeError;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn cleaned(text: &str) -> TranscribedText {
        TranscribedText {
            cleaned: text.to_string(),
            chinese_variant: None,
        }
    }

    fn cleaned_zh(text: &str, variant: &str) -> TranscribedText {
        TranscribedText {
            cleaned: text.to_string(),
            chinese_variant: Some(variant.to_string()),
        }
    }

    #[test]
    fn no_samples_returns_nothing_to_paste() {
        let a = decide_end_of_recording(false, Ok(cleaned("anything")));
        assert!(matches!(a, EndOfRecordingAction::NothingToPaste));
    }

    #[test]
    fn timeout_returns_show_error() {
        let a = decide_end_of_recording(true, Err(TranscribeError::TimedOut));
        match a {
            EndOfRecordingAction::ShowError(msg) => {
                assert!(
                    msg.to_lowercase().contains("timeout"),
                    "error message should mention the timeout, got {msg:?}"
                );
            }
            other => panic!("expected ShowError, got {other:?}"),
        }
    }

    #[test]
    fn whisper_failure_returns_show_error() {
        let a = decide_end_of_recording(
            true,
            Err(TranscribeError::Failed("model not loaded".to_string())),
        );
        match a {
            EndOfRecordingAction::ShowError(msg) => {
                assert!(msg.to_lowercase().contains("model not loaded"));
            }
            other => panic!("expected ShowError, got {other:?}"),
        }
    }

    #[test]
    fn empty_cleaned_text_returns_nothing_to_paste() {
        // Whisper hallucination mapped to "".
        let a = decide_end_of_recording(true, Ok(cleaned("")));
        assert!(matches!(a, EndOfRecordingAction::NothingToPaste));
    }

    #[test]
    fn whitespace_only_cleaned_text_returns_nothing_to_paste() {
        let a = decide_end_of_recording(true, Ok(cleaned("   \t\n  ")));
        assert!(matches!(a, EndOfRecordingAction::NothingToPaste));
    }

    #[test]
    fn valid_cleaned_text_with_no_zh_routes_to_post_process() {
        let a = decide_end_of_recording(true, Ok(cleaned("hello world")));
        match a {
            EndOfRecordingAction::PostProcess(text) => assert_eq!(text, "hello world"),
            other => panic!("expected PostProcess, got {other:?}"),
        }
    }

    #[test]
    fn blank_audio_control_marker_is_removed_before_output() {
        let a = decide_end_of_recording(
            true,
            Ok(cleaned(
                "Ok, je fais juste un test pour voir. Ça a l'air d'être pas mal. [BLANK_AUDIO]",
            )),
        );

        match a {
            EndOfRecordingAction::PostProcess(text) => assert_eq!(
                text,
                "Ok, je fais juste un test pour voir. Ça a l'air d'être pas mal."
            ),
            other => panic!("expected PostProcess, got {other:?}"),
        }
    }

    #[test]
    fn blank_audio_control_marker_does_not_require_leading_whitespace() {
        let a = decide_end_of_recording(true, Ok(cleaned("Salut[BLANK_AUDIO]")));

        match a {
            EndOfRecordingAction::PostProcess(text) => assert_eq!(text, "Salut"),
            other => panic!("expected PostProcess, got {other:?}"),
        }
    }

    #[test]
    fn unrelated_bracketed_text_is_preserved_before_output() {
        let text = "Keep [BLANK], [AUDIO], and variable[BLANK_AUDIO]suffix.";
        let a = decide_end_of_recording(true, Ok(cleaned(text)));

        match a {
            EndOfRecordingAction::PostProcess(output) => assert_eq!(output, text),
            other => panic!("expected PostProcess, got {other:?}"),
        }
    }

    #[test]
    fn blank_audio_control_marker_alone_produces_nothing_to_paste() {
        let a = decide_end_of_recording(true, Ok(cleaned("[BLANK_AUDIO]")));
        assert!(matches!(a, EndOfRecordingAction::NothingToPaste));
    }

    #[test]
    fn chinese_variant_routes_to_paste_direct_with_converted_text() {
        let a = decide_end_of_recording(true, Ok(cleaned_zh("你好世界", "你好世界")));
        match a {
            EndOfRecordingAction::PasteDirect { pasted, .. } => assert_eq!(pasted, "你好世界"),
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn chinese_variant_takes_precedence_over_cleaned() {
        let a = decide_end_of_recording(true, Ok(cleaned_zh("simplified", "TRADITIONAL")));
        match a {
            EndOfRecordingAction::PasteDirect { pasted, .. } => assert_eq!(pasted, "TRADITIONAL"),
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn chinese_variant_preserves_cleaned_text_for_history() {
        // Regression: history must keep cleaned (pre-conversion) text distinct from the pasted variant.
        let a = decide_end_of_recording(true, Ok(cleaned_zh("简体输出", "繁體輸出")));
        match a {
            EndOfRecordingAction::PasteDirect { cleaned, pasted } => {
                assert_eq!(
                    cleaned, "简体输出",
                    "cleaned must stay pre-conversion for history"
                );
                assert_eq!(
                    pasted, "繁體輸出",
                    "pasted + post_processed must be the converted variant"
                );
            }
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn audio_is_silent_true_for_all_zeros() {
        use crate::actions::audio_is_silent;
        let buf = vec![0.0_f32; 16_000];
        assert!(audio_is_silent(&buf));
    }

    #[test]
    fn audio_is_silent_true_for_empty_buffer() {
        use crate::actions::audio_is_silent;
        let buf: Vec<f32> = Vec::new();
        assert!(audio_is_silent(&buf));
    }

    #[test]
    fn audio_is_silent_true_for_room_tone_below_threshold() {
        use crate::actions::audio_is_silent;
        let buf = vec![0.001_f32; 16_000];
        assert!(audio_is_silent(&buf));
    }

    #[test]
    fn audio_is_silent_false_for_speech_amplitude() {
        use crate::actions::audio_is_silent;
        let buf = vec![0.1_f32; 16_000];
        assert!(!audio_is_silent(&buf));
    }

    #[test]
    fn audio_is_silent_false_at_threshold_boundary() {
        // Locks strict-less-than against future `<=` regression.
        use crate::actions::audio_is_silent;
        let buf = vec![0.01_f32; 16_000];
        assert!(!audio_is_silent(&buf));
    }

    #[test]
    fn empty_cleaned_with_chinese_variant_still_nothing_to_paste() {
        let a = decide_end_of_recording(true, Ok(cleaned_zh("", "")));
        assert!(matches!(a, EndOfRecordingAction::NothingToPaste));
    }

    #[test]
    fn completed_streaming_transcript_skips_batch_decode() {
        let batch_called = AtomicBool::new(false);
        let recording = RecordedDictation {
            had_long_pause: false,
            samples: vec![0.1; 16_000],
            streaming_transcript: Some("live final transcript".to_string()),
        };

        let result = transcribe_recording(&recording, false, |_| {
            batch_called.store(true, Ordering::SeqCst);
            Ok("batch transcript".to_string())
        });

        assert_eq!(
            result.expect("streaming transcript"),
            "live final transcript"
        );
        assert!(!batch_called.load(Ordering::SeqCst));
    }

    #[test]
    fn automatic_language_detection_uses_full_audio_decode() {
        let batch_called = AtomicBool::new(false);
        let recording = RecordedDictation {
            had_long_pause: false,
            samples: vec![0.1; 16_000],
            streaming_transcript: Some("mixed-language preview".to_string()),
        };

        let result = transcribe_recording(&recording, true, |_| {
            batch_called.store(true, Ordering::SeqCst);
            Ok("full-audio transcript".to_string())
        });

        assert_eq!(result.expect("batch transcript"), "full-audio transcript");
        assert!(batch_called.load(Ordering::SeqCst));
    }

    #[test]
    fn missing_streaming_session_uses_batch_decode() {
        let recording = RecordedDictation {
            had_long_pause: false,
            samples: vec![0.1; 16_000],
            streaming_transcript: None,
        };

        let result = transcribe_recording(&recording, false, |samples| {
            Ok(format!("batch decoded {}", samples.len()))
        });

        assert_eq!(result.expect("batch transcript"), "batch decoded 16000");
    }

    #[test]
    fn long_pause_prefers_quality_batch_decode_over_streaming_preview() {
        let recording = RecordedDictation {
            had_long_pause: true,
            samples: vec![0.1; 32_000],
            streaming_transcript: Some("quick fragmented preview".to_string()),
        };

        let result = transcribe_recording(&recording, false, |samples| {
            assert_eq!(samples.len(), 32_000);
            Ok("higher quality complete transcript".to_string())
        });

        assert_eq!(
            result.expect("batch transcript"),
            "higher quality complete transcript"
        );
    }

    #[test]
    fn long_pause_falls_back_to_streaming_text_when_batch_decode_fails() {
        let recording = RecordedDictation {
            had_long_pause: true,
            samples: vec![0.1; 32_000],
            streaming_transcript: Some("recoverable streaming transcript".to_string()),
        };

        let result = transcribe_recording(&recording, false, |_| Err(TranscribeError::TimedOut));
        assert_eq!(
            result.expect("streaming fallback"),
            "recoverable streaming transcript"
        );
    }

    #[test]
    fn empty_streaming_result_uses_batch_decode() {
        let recording = RecordedDictation {
            had_long_pause: false,
            samples: vec![0.1; 16_000],
            streaming_transcript: Some(String::new()),
        };

        let result =
            transcribe_recording(&recording, false, |_| Ok("batch transcript".to_string()));
        assert_eq!(result.expect("batch transcript"), "batch transcript");
    }

    #[test]
    fn disabled_post_process_routes_transcript_to_direct_paste() {
        let action = apply_post_process_preference(
            EndOfRecordingAction::PostProcess("local transcript".to_string()),
            false,
        );

        match action {
            EndOfRecordingAction::PasteDirect { cleaned, pasted } => {
                assert_eq!(cleaned, "local transcript");
                assert_eq!(pasted, "local transcript");
            }
            other => panic!("expected direct paste, got {other:?}"),
        }
    }

    #[test]
    fn delayed_start_feedback_never_mutes_after_stop_or_replacement() {
        assert!(!should_apply_start_feedback(7, 7, false));
        assert!(!should_apply_start_feedback(8, 7, true));
        assert!(should_apply_start_feedback(7, 7, true));
    }

    #[test]
    fn stale_start_failure_cannot_reset_a_newer_recording() {
        assert!(is_current_operation(7, 7));
        assert!(!is_current_operation(8, 7));
    }
}

#[cfg(test)]
mod pending_audio_tests {
    use super::{stash_pending_audio, take_pending_audio};

    /// One test owns the process-wide slot; splitting it would race the other cases.
    #[test]
    fn stash_is_handed_over_once_and_only_to_its_own_generation() {
        stash_pending_audio(7, vec![0.5; 4]);

        assert!(
            take_pending_audio(6).is_empty(),
            "wrong generation gets none"
        );
        assert!(
            take_pending_audio(7).is_empty(),
            "a mismatched take still clears the slot"
        );

        stash_pending_audio(8, vec![0.5; 4]);
        assert_eq!(take_pending_audio(8).len(), 4);
        assert!(
            take_pending_audio(8).is_empty(),
            "taken buffers are released"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{get_default_settings, LLMPrompt};

    fn settings_with_post_process() -> AppSettings {
        let mut s = get_default_settings();
        s.post_process_enabled = true;
        s.post_process_provider_id = "ollama".to_string();
        s.post_process_models
            .insert("ollama".to_string(), "llama3".to_string());
        s.post_process_prompts = vec![LLMPrompt {
            id: "test_prompt".to_string(),
            name: "Test".to_string(),
            prompt: "Fix this: ${output}".to_string(),
        }];
        s.post_process_selected_prompt_id = Some("test_prompt".to_string());
        s
    }

    fn should_skip_post_process(settings: &AppSettings) -> bool {
        if !settings.post_process_enabled {
            return true;
        }
        if settings.active_post_process_provider().is_none() {
            return true;
        }
        let provider = settings.active_post_process_provider().unwrap();
        let model = settings
            .post_process_models
            .get(&provider.id)
            .cloned()
            .unwrap_or_default();
        if model.trim().is_empty() {
            return true;
        }
        if settings.post_process_selected_prompt_id.is_none() {
            return true;
        }
        let prompt_id = settings.post_process_selected_prompt_id.as_ref().unwrap();
        let prompt = settings
            .post_process_prompts
            .iter()
            .find(|p| &p.id == prompt_id);
        !matches!(prompt, Some(p) if !p.prompt.trim().is_empty())
    }

    #[test]
    fn disabled_returns_empty() {
        let mut s = settings_with_post_process();
        s.post_process_enabled = false;
        assert!(should_skip_post_process(&s), "Should skip when disabled");
    }

    #[test]
    fn no_provider_returns_empty() {
        let mut s = settings_with_post_process();
        s.post_process_provider_id = "nonexistent_provider".to_string();
        assert!(
            should_skip_post_process(&s),
            "Should skip when provider is invalid"
        );
    }

    #[test]
    fn no_model_returns_empty() {
        let mut s = settings_with_post_process();
        s.post_process_models
            .insert("ollama".to_string(), "".to_string());
        assert!(
            should_skip_post_process(&s),
            "Should skip when model is empty"
        );
    }

    #[test]
    fn no_prompt_returns_empty() {
        let mut s = settings_with_post_process();
        s.post_process_selected_prompt_id = None;
        assert!(
            should_skip_post_process(&s),
            "Should skip when no prompt is selected"
        );
    }

    #[test]
    fn valid_settings_should_not_skip() {
        let s = settings_with_post_process();
        assert!(
            !should_skip_post_process(&s),
            "Should not skip with valid settings"
        );
    }

    #[test]
    fn missing_model_requires_an_explicit_settings_download() {
        let readiness = model_readiness_for_status("Medium", false, false);

        match readiness {
            ModelReadiness::Blocked(message) => {
                assert_eq!(
                    message,
                    "Download the Medium model in Settings before recording."
                );
            }
            _ => panic!("missing model must not start an implicit download"),
        }
    }

    #[test]
    fn active_download_reports_stable_english_status() {
        let readiness = model_readiness_for_status("Medium", false, true);

        match readiness {
            ModelReadiness::Downloading(message) => {
                assert_eq!(message, "Downloading the Medium model…");
            }
            _ => panic!("active download should block recording"),
        }
    }
}
