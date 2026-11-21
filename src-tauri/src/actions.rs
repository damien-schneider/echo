use crate::audio_feedback::{play_feedback_sound, SoundType};
use crate::audio_toolkit::constants::SAMPLE_RATE;
use crate::features::polish::manager::PolishManager;
use crate::managers::audio::AudioRecordingManager;
use crate::managers::cleanup_apply::clean_transcript;
use crate::managers::hallucination::HallucinationFilter;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::{
    transcription_timeout, TranscribeError, TranscriptionManager,
};
use crate::model_pass::{routed_model_pass, ModelPass, ModelPassOutcome, Spoken, ToolResult};
use crate::overlay::{
    show_model_required_overlay, show_tool_overlay, show_transcribing_overlay, show_warning_overlay,
};
use crate::settings::{get_settings, AppSettings};
use crate::tray::{change_tray_icon, TrayIconState};
use crate::utils;
use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use log::{debug, error, info, warn};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;
use std::time::Instant;
use tauri::AppHandle;
use tauri::Manager;

mod start;

pub(crate) use start::start_dictation;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordedAudio {
    Missing,
    Silent,
    Audible,
}

/// Input to pure [`decide_end_of_recording`].
#[derive(Debug, Clone)]
pub struct TranscribedText {
    pub cleaned: String,
    /// Set only for zh-Hans/zh-Hant via OpenCC.
    pub chinese_variant: Option<String>,
}

#[derive(Debug)]
pub enum EndOfRecordingAction {
    RunModel {
        transcript: String,
        pass: ModelPass,
    },
    /// Skip LLM. `pasted` is the zh variant; `cleaned` is the pre-conversion text kept for history.
    PasteDirect {
        cleaned: String,
        pasted: String,
    },
    /// Digital silence never reaches the decoder, so there is nothing worth keeping.
    NothingToPaste,
    /// The decoder heard the recording but found no text; History keeps it for a retranscribe.
    NoTextInAudio,
    /// Stopped while the microphone was still opening: nothing was captured to transcribe.
    StoppedBeforeCapture,
    /// History keeps the recording so a retranscribe can recover it.
    DecodeFailed(String),
    ShowError(String),
}

async fn apply_end_of_recording_action(
    ah: AppHandle,
    action: EndOfRecordingAction,
    gen: u64,
    samples: Vec<f32>,
    hm: Arc<HistoryManager>,
) {
    match action {
        EndOfRecordingAction::NothingToPaste => end_empty(&ah, gen, NO_SPEECH),
        EndOfRecordingAction::NoTextInAudio => {
            let notice = keep_untranscribed(&hm, samples, NO_SPEECH).await;
            end_empty(&ah, gen, &notice);
        }
        EndOfRecordingAction::StoppedBeforeCapture => {
            end_empty(&ah, gen, "Stopped before the microphone was ready");
        }
        EndOfRecordingAction::DecodeFailed(message) => {
            let notice = keep_untranscribed(&hm, samples, &message).await;
            end_with_error(&ah, gen, &notice);
        }
        EndOfRecordingAction::ShowError(message) => end_with_error(&ah, gen, &message),
        EndOfRecordingAction::PasteDirect { cleaned, pasted } => {
            let record = DictationRecord {
                samples,
                spoken: cleaned,
                processed: Some(pasted.clone()),
                prompt_name: None,
            };
            save_to_history(hm, record);
            deliver_transcript(&ah, pasted, gen).await;
        }
        EndOfRecordingAction::RunModel { transcript, pass } => {
            let spoken = Spoken {
                transcript: &transcript,
                generation: gen,
            };
            let outcome = crate::model_pass::run(&ah, pass, spoken).await;
            let (processed, prompt_name) = outcome.rewrite().unzip();
            let record = DictationRecord {
                samples,
                spoken: transcript.clone(),
                processed,
                prompt_name,
            };
            save_to_history(hm, record);
            match outcome {
                ModelPassOutcome::Unchanged => deliver_transcript(&ah, transcript, gen).await,
                ModelPassOutcome::Rewritten { text, .. } => {
                    deliver_transcript(&ah, text, gen).await;
                }
                ModelPassOutcome::Commanded(reply) => report_command(&ah, &reply, gen),
            }
        }
    }
}

const NO_SPEECH: &str = "No speech detected";

/// The preview never stands in for the transcript, so the kept entry has none.
async fn keep_untranscribed(history: &HistoryManager, samples: Vec<f32>, reason: &str) -> String {
    match history
        .save_transcription(samples, String::new(), None, None)
        .await
    {
        Ok(_) => format!("{reason} — kept in History"),
        Err(error) => {
            error!("Failed to keep the untranscribed recording in History: {error:#}");
            reason.to_string()
        }
    }
}

fn end_with_error(ah: &AppHandle, gen: u64, message: &str) {
    error!("Transcription stop ended with error: {message}");
    crate::dictation::abandon(ah);
    // Never leave UI stuck on "transcribing".
    if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
        show_warning_overlay(ah, message);
        change_tray_icon(ah, TrayIconState::Idle);
    }
}

/// The chat composer shows its own empty state; anywhere else the island has to say why nothing was typed.
fn end_empty(ah: &AppHandle, gen: u64, reason: &str) {
    info!("Dictation ended with nothing to deliver: {reason}");
    let is_composing_chat = crate::dictation::routes_to_chat();
    crate::dictation::abandon(ah);
    if OPERATION_GENERATION.load(Ordering::SeqCst) != gen {
        return;
    }
    if is_composing_chat {
        utils::hide_recording_overlay(ah);
    } else {
        show_warning_overlay(ah, reason);
    }
    change_tray_icon(ah, TrayIconState::Idle);
}

/// The paste holds the main thread, which commits the island's frames, so the exit gets onto the screen first.
const EXIT_HEAD_START: Duration = Duration::from_millis(48);

/// The one exit every dictation takes. Awaited, so the next press waits until the text has landed.
async fn deliver_transcript(ah: &AppHandle, text: String, gen: u64) {
    let Some(caret_text) = on_main_thread(ah, move |ah| leave_unless_stale(ah, text, gen)).await
    else {
        if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
            utils::hide_recording_overlay(ah);
            change_tray_icon(ah, TrayIconState::Idle);
        }
        return;
    };
    let Some(text) = caret_text else {
        return;
    };
    tokio::time::sleep(EXIT_HEAD_START).await;
    on_main_thread(ah, move |ah| {
        if OPERATION_GENERATION.load(Ordering::SeqCst) == gen {
            crate::dictation::deliver_to_caret(ah, text);
            change_tray_icon(ah, TrayIconState::Idle);
        }
    })
    .await;
}

fn leave_unless_stale(
    ah: &AppHandle,
    text: String,
    gen: u64,
) -> Option<crate::dictation::CaretText> {
    if OPERATION_GENERATION.load(Ordering::SeqCst) != gen {
        return None;
    }
    utils::hide_recording_overlay(ah);
    let caret_text = crate::dictation::deliver_off_caret(ah, text);
    if caret_text.is_none() {
        change_tray_icon(ah, TrayIconState::Idle);
    }
    caret_text
}

async fn on_main_thread<T: Send + 'static>(
    ah: &AppHandle,
    work: impl FnOnce(&AppHandle) -> T + Send + 'static,
) -> Option<T> {
    let (done, result) = tokio::sync::oneshot::channel();
    let on_main = ah.clone();
    let scheduled = ah.run_on_main_thread(move || {
        let _ = done.send(work(&on_main));
    });
    if let Err(error) = scheduled {
        error!("Failed to deliver the transcription: {error:?}");
        return None;
    }
    result.await.ok()
}

struct DictationRecord {
    samples: Vec<f32>,
    spoken: String,
    processed: Option<String>,
    prompt_name: Option<String>,
}

fn save_to_history(history: Arc<HistoryManager>, record: DictationRecord) {
    tauri::async_runtime::spawn(async move {
        let saved = history
            .save_transcription(
                record.samples,
                record.spoken,
                record.processed,
                record.prompt_name,
            )
            .await;
        if let Err(e) = saved {
            error!("Failed to save transcription to history: {}", e);
        }
    });
}

/// A command that failed says so as a warning: the success card would read as done.
fn report_command(ah: &AppHandle, reply: &ToolResult, gen: u64) {
    if OPERATION_GENERATION.load(Ordering::SeqCst) != gen {
        return;
    }
    crate::model_pass::speak_reply(ah, &reply.display_message);
    if reply.success {
        show_tool_overlay(ah, &reply.display_message);
    } else {
        show_warning_overlay(ah, &reply.display_message);
    }
    change_tray_icon(ah, TrayIconState::Idle);
}

/// Only digital zeros skip the decode: the VAD already chose what counts as speech.
pub fn audio_is_silent(samples: &[f32]) -> bool {
    crate::audio_toolkit::audio::is_digital_silence(samples)
}

/// The preview never stands in for the transcript: one decode of the whole recording always does.
async fn transcribe_stopped_recording(
    ah: &AppHandle,
    tm: &TranscriptionManager,
    samples: &[f32],
) -> Result<TranscribedText, TranscribeError> {
    let decode_time = Instant::now();
    let text = tm
        .transcribe_with_timeout(samples.to_vec(), transcription_timeout(samples.len()))
        .inspect_err(|error| info!("stop: transcription failed: {error}"))?;
    info!(
        "stop: transcript ready ({} chars) in {:?}",
        text.len(),
        decode_time.elapsed()
    );
    let settings = get_settings(ah);
    let cleaned = clean_transcript(&text, HallucinationFilter::Strict, &settings);
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
    recorded: RecordedAudio,
    transcribe_outcome: Result<TranscribedText, TranscribeError>,
    pass: Option<ModelPass>,
) -> EndOfRecordingAction {
    match recorded {
        RecordedAudio::Missing => return EndOfRecordingAction::StoppedBeforeCapture,
        RecordedAudio::Silent => return EndOfRecordingAction::NothingToPaste,
        RecordedAudio::Audible => {}
    }
    match transcribe_outcome {
        Err(TranscribeError::TimedOut) => {
            EndOfRecordingAction::DecodeFailed("Transcription timed out".to_string())
        }
        Err(TranscribeError::Failed(msg)) => {
            EndOfRecordingAction::DecodeFailed(format!("Transcription failed: {msg}"))
        }
        Ok(t) => {
            let cleaned = sanitize_dictation_output(&t.cleaned);
            if cleaned.is_empty() {
                return EndOfRecordingAction::NoTextInAudio;
            }
            match (t.chinese_variant, pass) {
                (Some(variant), _) => EndOfRecordingAction::PasteDirect {
                    cleaned,
                    pasted: sanitize_dictation_output(&variant),
                },
                (None, Some(pass)) => EndOfRecordingAction::RunModel {
                    transcript: cleaned,
                    pass,
                },
                (None, None) => EndOfRecordingAction::PasteDirect {
                    pasted: cleaned.clone(),
                    cleaned,
                },
            }
        }
    }
}

/// Bumps on every accepted start, stop, or cancel so stale work cannot mutate UI.
pub(crate) static OPERATION_GENERATION: AtomicU64 = AtomicU64::new(0);

/// A new dictation makes the previous one stale and drops its text, so it waits for that text to land.
pub(crate) fn previous_dictation_is_settling() -> bool {
    TRANSCRIPTION_TASK.lock().is_ok_and(|task| {
        task.as_ref()
            .is_some_and(|handle| !handle.inner().is_finished())
    })
}

/// Last resort above the inner per-join budgets (~3s) — past it the audio path is abandoned so the UI can't stick.
pub const STOP_RECORDING_CEILING: Duration = Duration::from_secs(10);

/// Aborted on new stop/cancel to halt stale LLM post-process calls.
pub(crate) static TRANSCRIPTION_TASK: Mutex<Option<tauri::async_runtime::JoinHandle<()>>> =
    Mutex::new(None);

pub trait ShortcutAction: Send + Sync {
    fn is_one_shot(&self) -> bool {
        false
    }

    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
}

struct TranscribeAction;

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

/// Outcome of the pre-flight model check run before a dictation starts.
pub(crate) enum ModelReadiness {
    /// Downloaded; the decode path loads it if needed.
    Ready,
    /// Cannot record right now; show `String` and abort the press.
    Blocked(String),
    /// Model is downloading; show `String` and abort the press.
    Downloading(String),
}

impl ModelReadiness {
    /// Liftable blocks stay on the island with their download. `Some` when the dictation must not run.
    fn report_block(self, app: &AppHandle) -> Option<String> {
        match self {
            ModelReadiness::Ready => None,
            ModelReadiness::Blocked(message) => {
                show_model_required_overlay(app, &message);
                Some(message)
            }
            ModelReadiness::Downloading(message) => {
                show_warning_overlay(app, &message);
                Some(message)
            }
        }
    }
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
    ModelReadiness::Blocked(format!("Download the {name} model to dictate"))
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

impl ShortcutAction for TranscribeAction {
    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let _ = start::start_dictation(app, binding_id);
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let stop_time = Instant::now();
        debug!("TranscribeAction::stop called for binding: {}", binding_id);
        let ah = app.clone();
        let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
        let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
        let hm = Arc::clone(&app.state::<Arc<HistoryManager>>());
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
                    )
                    .await;
                    return;
                }
            };
            let recorded = match recording_opt.as_deref() {
                None => RecordedAudio::Missing,
                Some(samples) if audio_is_silent(samples) => RecordedAudio::Silent,
                Some(_) => RecordedAudio::Audible,
            };
            let samples = recording_opt.unwrap_or_default();
            info!(
                "stop: stop_recording returned in {:?} — {} samples ({:.1}s audio), {recorded:?}",
                stop_recording_time.elapsed(),
                samples.len(),
                samples.len() as f32 / SAMPLE_RATE as f32,
            );

            let outcome = if recorded == RecordedAudio::Audible {
                transcribe_stopped_recording(&ah, &tm, &samples).await
            } else {
                Ok(TranscribedText {
                    cleaned: String::new(),
                    chinese_variant: None,
                })
            };
            let pass = routed_model_pass(&ah);
            info!("stop: model pass {pass:?}");
            let action = decide_end_of_recording(recorded, outcome, pass);
            // Moved, never cloned — the buffer is the largest allocation a dictation makes.
            apply_end_of_recording_action(ah, action, gen, samples, hm).await;
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

struct ChatAction;

impl ShortcutAction for ChatAction {
    fn is_one_shot(&self) -> bool {
        true
    }

    fn start(&self, app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = crate::overlay::open_chat(app).await {
                warn!("Could not open chat from shortcut: {error}");
            }
        });
    }

    fn stop(&self, _app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {}
}

pub static ACTION_MAP: LazyLock<HashMap<String, Arc<dyn ShortcutAction>>> = LazyLock::new(|| {
    let mut map = HashMap::new();
    map.insert(
        "transcribe".to_string(),
        Arc::new(TranscribeAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "polish".to_string(),
        Arc::new(PolishAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "chat".to_string(),
        Arc::new(ChatAction) as Arc<dyn ShortcutAction>,
    );
    map
});

#[cfg(test)]
mod decision_tests {
    use super::{
        decide_end_of_recording, is_current_operation, should_apply_start_feedback,
        EndOfRecordingAction, RecordedAudio, TranscribedText,
    };
    use crate::managers::transcription::TranscribeError;
    use crate::model_pass::ModelPass;

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
    fn a_stop_before_any_capture_is_told_apart_from_silence() {
        let a = decide_end_of_recording(RecordedAudio::Missing, Ok(cleaned("anything")), None);
        assert!(matches!(a, EndOfRecordingAction::StoppedBeforeCapture));
    }

    #[test]
    fn digital_silence_is_not_kept() {
        let a = decide_end_of_recording(RecordedAudio::Silent, Ok(cleaned("")), None);
        assert!(matches!(a, EndOfRecordingAction::NothingToPaste));
    }

    #[test]
    fn a_decode_timeout_keeps_the_recording() {
        let a =
            decide_end_of_recording(RecordedAudio::Audible, Err(TranscribeError::TimedOut), None);
        match a {
            EndOfRecordingAction::DecodeFailed(msg) => {
                assert!(
                    msg.to_lowercase().contains("timed out"),
                    "error message should mention the timeout, got {msg:?}"
                );
            }
            other => panic!("expected DecodeFailed, got {other:?}"),
        }
    }

    #[test]
    fn a_decode_failure_keeps_the_recording() {
        let a = decide_end_of_recording(
            RecordedAudio::Audible,
            Err(TranscribeError::Failed("model not loaded".to_string())),
            None,
        );
        match a {
            EndOfRecordingAction::DecodeFailed(msg) => {
                assert!(msg.to_lowercase().contains("model not loaded"));
            }
            other => panic!("expected DecodeFailed, got {other:?}"),
        }
    }

    #[test]
    fn audible_recording_decoded_to_nothing_is_kept() {
        let a = decide_end_of_recording(RecordedAudio::Audible, Ok(cleaned("")), None);
        assert!(matches!(a, EndOfRecordingAction::NoTextInAudio));
    }

    #[test]
    fn whitespace_only_cleaned_text_is_kept_without_pasting() {
        let a = decide_end_of_recording(RecordedAudio::Audible, Ok(cleaned("   \t\n  ")), None);
        assert!(matches!(a, EndOfRecordingAction::NoTextInAudio));
    }

    #[test]
    fn valid_cleaned_text_runs_the_routed_model_pass() {
        let a = decide_end_of_recording(
            RecordedAudio::Audible,
            Ok(cleaned("hello world")),
            Some(ModelPass::Command),
        );
        match a {
            EndOfRecordingAction::RunModel { transcript, pass } => {
                assert_eq!(transcript, "hello world");
                assert_eq!(pass, ModelPass::Command);
            }
            other => panic!("expected RunModel, got {other:?}"),
        }
    }

    #[test]
    fn valid_cleaned_text_without_a_model_pass_pastes_directly() {
        let a = decide_end_of_recording(RecordedAudio::Audible, Ok(cleaned("hello world")), None);
        match a {
            EndOfRecordingAction::PasteDirect { cleaned, pasted } => {
                assert_eq!(cleaned, "hello world");
                assert_eq!(pasted, "hello world");
            }
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn blank_audio_control_marker_is_removed_before_output() {
        let a = decide_end_of_recording(
            RecordedAudio::Audible,
            Ok(cleaned(
                "Ok, je fais juste un test pour voir. Ça a l'air d'être pas mal. [BLANK_AUDIO]",
            )),
            None,
        );

        match a {
            EndOfRecordingAction::PasteDirect { pasted, .. } => assert_eq!(
                pasted,
                "Ok, je fais juste un test pour voir. Ça a l'air d'être pas mal."
            ),
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn blank_audio_control_marker_does_not_require_leading_whitespace() {
        let a = decide_end_of_recording(
            RecordedAudio::Audible,
            Ok(cleaned("Salut[BLANK_AUDIO]")),
            None,
        );

        match a {
            EndOfRecordingAction::PasteDirect { pasted, .. } => assert_eq!(pasted, "Salut"),
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn unrelated_bracketed_text_is_preserved_before_output() {
        let text = "Keep [BLANK], [AUDIO], and variable[BLANK_AUDIO]suffix.";
        let a = decide_end_of_recording(RecordedAudio::Audible, Ok(cleaned(text)), None);

        match a {
            EndOfRecordingAction::PasteDirect { pasted, .. } => assert_eq!(pasted, text),
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn blank_audio_control_marker_alone_is_kept_without_pasting() {
        let a = decide_end_of_recording(RecordedAudio::Audible, Ok(cleaned("[BLANK_AUDIO]")), None);
        assert!(matches!(a, EndOfRecordingAction::NoTextInAudio));
    }

    #[test]
    fn chinese_variant_skips_the_model_pass_and_pastes_the_converted_text() {
        let a = decide_end_of_recording(
            RecordedAudio::Audible,
            Ok(cleaned_zh("你好世界", "你好世界")),
            Some(ModelPass::Rewrite),
        );
        match a {
            EndOfRecordingAction::PasteDirect { pasted, .. } => assert_eq!(pasted, "你好世界"),
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn chinese_variant_takes_precedence_over_cleaned() {
        let a = decide_end_of_recording(
            RecordedAudio::Audible,
            Ok(cleaned_zh("simplified", "TRADITIONAL")),
            None,
        );
        match a {
            EndOfRecordingAction::PasteDirect { pasted, .. } => assert_eq!(pasted, "TRADITIONAL"),
            other => panic!("expected PasteDirect, got {other:?}"),
        }
    }

    #[test]
    fn chinese_variant_preserves_cleaned_text_for_history() {
        // Regression: history must keep cleaned (pre-conversion) text distinct from the pasted variant.
        let a = decide_end_of_recording(
            RecordedAudio::Audible,
            Ok(cleaned_zh("简体输出", "繁體輸出")),
            None,
        );
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
    fn signal_below_the_digital_floor_is_silent() {
        use crate::actions::audio_is_silent;
        let buf = vec![0.000_05_f32; 16_000];
        assert!(audio_is_silent(&buf));
    }

    #[test]
    fn audio_is_silent_false_for_speech_amplitude() {
        use crate::actions::audio_is_silent;
        let buf = vec![0.1_f32; 16_000];
        assert!(!audio_is_silent(&buf));
    }

    #[test]
    fn quiet_speech_kept_by_the_vad_reaches_the_decoder() {
        use crate::actions::audio_is_silent;
        let buf = vec![0.008_f32; 16_000];
        assert!(!audio_is_silent(&buf));
    }

    #[test]
    fn speech_between_long_pauses_reaches_the_decoder() {
        use crate::actions::audio_is_silent;
        let mut buf = vec![0.018_f32; 16_000];
        buf.resize(64_000, 0.0);
        assert!(!audio_is_silent(&buf));
    }

    #[test]
    fn a_real_quiet_voice_reaches_the_decoder() {
        use crate::actions::audio_is_silent;
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/quiet-speech.wav");
        let speech = crate::audio_toolkit::load_wav_file(fixture).unwrap();
        assert!(!audio_is_silent(&speech));
    }

    #[test]
    fn empty_cleaned_with_chinese_variant_is_kept_without_pasting() {
        let a = decide_end_of_recording(RecordedAudio::Audible, Ok(cleaned_zh("", "")), None);
        assert!(matches!(a, EndOfRecordingAction::NoTextInAudio));
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
mod tests {
    use super::*;

    #[test]
    fn missing_model_requires_an_explicit_settings_download() {
        let readiness = model_readiness_for_status("Medium", false, false);

        match readiness {
            ModelReadiness::Blocked(message) => {
                assert_eq!(message, "Download the Medium model to dictate");
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
