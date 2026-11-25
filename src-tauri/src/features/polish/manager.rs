use anyhow::{Context, Result};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

mod deletion;
mod model_failure;
mod model_selection;
mod preparation;
mod runtime_slot;
mod setup;

use crate::managers::model::ModelManager;
use crate::overlay::{show_processing_overlay, show_tool_overlay, show_warning_overlay};
use crate::settings;

use super::chat_context::{
    chat_request_turns, chat_text_context, ChatContextCapture, ChatContextSource, ChatTextContext,
    ShownChatContext,
};
use super::platform::{
    read_selected_text, settled_selection, DirectSelection, PlatformClipboard, PlatformFocus,
    PlatformKeyboard, SettledSelection,
};
use super::runtime::{stop_orphaned_server, PolishRuntime};
use super::selection::{
    CancellationClock, CapturedPolishInput, PolishOutcome, PolishTransaction,
    PolishTransactionPorts, SelectionMode,
};
use super::{
    polish_failure_status, polish_use_preparation, polish_warning_message, BundledChatMessage,
    PolishFailureStage, PolishState, PolishStatus, PolishUsePreparation,
};
use model_selection::{
    selected_polish_model, PolishModelCatalog, PolishModelDescriptor, PolishStatusSnapshot,
};
use runtime_slot::{RuntimeLease, RuntimeSlot};
use setup::{polish_initialization, polish_runtime_config, selection_mode};

pub(crate) use model_failure::language_model_message;

const CHAT_ANSWER_EVENT: &str = "polish-chat-answer";

#[derive(Clone, Debug, Serialize)]
struct ChatAnswerEvent {
    answer: String,
    stream_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SelectionRead {
    NothingSelected,
    PermissionRequired,
    Selected(String),
    Copied {
        mode: SelectionMode,
        text: Option<String>,
    },
}

impl SelectionRead {
    /// A refused read is a fault to report; an empty one is an answer — `None` is "nothing selected".
    pub(crate) fn text(self) -> Result<Option<String>> {
        match self {
            Self::PermissionRequired => {
                anyhow::bail!("Accessibility access is needed to read the selection")
            }
            Self::Selected(text)
            | Self::Copied {
                text: Some(text), ..
            } => Ok(Some(text)),
            Self::NothingSelected | Self::Copied { text: None, .. } => Ok(None),
        }
    }
}

/// Accessibility answers instantly when it can; otherwise the copy shortcut asks the app itself.
async fn selection_read(transaction: &PolishTransaction, generation: u64) -> Result<SelectionRead> {
    let observed = read_selected_text().unwrap_or_else(|error| {
        log::debug!("Accessibility could not read the selection: {error:#}");
        DirectSelection::Unavailable
    });
    match settled_selection(observed) {
        Some(SettledSelection::NothingSelected) => return Ok(SelectionRead::NothingSelected),
        Some(SettledSelection::PermissionRequired) => return Ok(SelectionRead::PermissionRequired),
        Some(SettledSelection::Text(text)) => return Ok(SelectionRead::Selected(text)),
        None => {}
    }
    let mode = selection_mode();
    Ok(SelectionRead::Copied {
        mode,
        text: transaction.capture_text(mode, generation).await?,
    })
}

fn copied_chat_context(mode: SelectionMode, text: Option<String>) -> Option<ChatTextContext> {
    let source = match mode {
        SelectionMode::ReplaceSelection => ChatContextSource::Selection,
        SelectionMode::ClipboardOnly => ChatContextSource::Clipboard,
    };
    text.map(|text| chat_text_context(text, source))
}

/// Focus is read before the selection: a user who switches app mid-capture must not be pasted into.
async fn captured_selection(
    transaction: &PolishTransaction,
    generation: u64,
) -> Result<Option<CapturedPolishInput>> {
    let focused_application = transaction.focused_application();
    let Some(text) = selection_read(transaction, generation).await?.text()? else {
        return Ok(None);
    };
    Ok(Some(CapturedPolishInput::new(
        text,
        focused_application,
        selection_mode(),
    )?))
}

pub(crate) struct PolishManager {
    pub(super) app: AppHandle,
    models: Arc<ModelManager>,
    runtime: RuntimeSlot<PolishRuntime>,
    runtime_path: PathBuf,
    initialization_error: Option<String>,
    cancellation: Arc<CancellationClock>,
    clipboard_access: Arc<tokio::sync::Mutex<()>>,
    chat_cancellation: Arc<CancellationClock>,
    chat_stop: watch::Sender<String>,
    status: Mutex<PolishStatusSnapshot>,
    model_operation: Mutex<Option<&'static str>>,
    preparation: tokio::sync::Mutex<()>,
}

impl PolishManager {
    pub(crate) fn new(app: &AppHandle, models: Arc<ModelManager>) -> Self {
        let model = selected_polish_model(settings::get_settings(app).polish_model_id.as_deref());
        let is_downloaded = models
            .get_model_info(model.id)
            .map(|model| model.is_downloaded)
            .unwrap_or(false);
        let initialization =
            polish_initialization(polish_runtime_config(app, &models, model.id), is_downloaded);
        stop_orphaned_server(&initialization.config);
        let runtime_path = initialization.config.server_path.clone();
        Self {
            app: app.clone(),
            models,
            runtime: RuntimeSlot::new(PolishRuntime::new(initialization.config)),
            runtime_path,
            initialization_error: initialization.error,
            clipboard_access: Arc::new(tokio::sync::Mutex::new(())),
            cancellation: Arc::new(CancellationClock::default()),
            chat_cancellation: Arc::new(CancellationClock::default()),
            chat_stop: watch::channel(String::new()).0,
            status: Mutex::new(PolishStatusSnapshot {
                model: model.into(),
                status: initialization.status,
            }),
            model_operation: Mutex::new(None),
            preparation: tokio::sync::Mutex::new(()),
        }
    }

    pub(crate) fn begin(&self) -> u64 {
        self.cancellation.begin()
    }

    pub(crate) fn cancel(&self) {
        self.cancellation.cancel();
        self.chat_cancellation.cancel();
    }

    pub(crate) fn begin_selection_read(&self) -> u64 {
        self.chat_cancellation.begin()
    }

    pub(crate) async fn read_selection(&self, generation: u64) -> Result<SelectionRead> {
        let transaction = self.transaction_with_cancellation(self.chat_cancellation.clone())?;
        selection_read(&transaction, generation).await
    }

    pub(crate) async fn capture_chat_context(&self, generation: u64) -> Result<ShownChatContext> {
        Ok(match self.read_selection(generation).await? {
            SelectionRead::NothingSelected => {
                ShownChatContext::read_by_accessibility(ChatContextCapture::Ready(None))
            }
            SelectionRead::PermissionRequired => {
                ShownChatContext::read_by_accessibility(ChatContextCapture::PermissionRequired)
            }
            SelectionRead::Selected(text) => {
                ShownChatContext::read_by_accessibility(ChatContextCapture::Ready(Some(
                    chat_text_context(text, ChatContextSource::Selection),
                )))
            }
            SelectionRead::Copied { mode, text } => ShownChatContext::read_by_copy(
                ChatContextCapture::Ready(copied_chat_context(mode, text)),
            ),
        })
    }

    /// Accessibility is blind to this app's selection, so only the copy shortcut can read it.
    #[cfg(target_os = "macos")]
    pub(crate) async fn copy_selection_for_chat(&self) -> Result<Option<ChatTextContext>> {
        let generation = self.begin_selection_read();
        let transaction = self.transaction_with_cancellation(self.chat_cancellation.clone())?;
        let mode = selection_mode();
        let text = transaction.capture_text(mode, generation).await?;
        Ok(copied_chat_context(mode, text))
    }

    pub(crate) fn observe_selected_text(&self) -> Result<DirectSelection> {
        read_selected_text()
    }

    pub(crate) async fn chat(
        &self,
        stream_id: &str,
        system: &str,
        messages: &[BundledChatMessage],
        expected_model_id: Option<&str>,
        thinking: bool,
    ) -> Result<String> {
        let messages = chat_request_turns(system, messages)?;
        let runtime = self
            .prepared_runtime()
            .await
            .context("Failed to prepare the local model for chat")?;
        let model = self.active_model();
        if expected_model_id.is_some_and(|id| id != model.id) {
            anyhow::bail!("The language model changed. Send your message again.");
        }
        if thinking && !model.supports_thinking {
            anyhow::bail!("{} does not support thinking", model.name);
        }
        let app = self.app.clone();
        let publish = move |answer: &str| {
            let _ = app.emit(
                CHAT_ANSWER_EVENT,
                ChatAnswerEvent {
                    answer: answer.to_owned(),
                    stream_id: stream_id.to_owned(),
                },
            );
        };
        // dropping the request closes the stream, which is how llama-server learns to stop
        tokio::select! {
            biased;
            () = self.await_chat_stop(stream_id) => anyhow::bail!("Echo chat was stopped"),
            answer = runtime.chat_with_thinking(system, messages, thinking, &publish) => answer,
        }
    }

    pub(crate) fn stop_chat(&self, stream_id: &str) {
        self.chat_stop.send_replace(stream_id.to_owned());
    }

    async fn await_chat_stop(&self, stream_id: &str) {
        let mut stops = self.chat_stop.subscribe();
        while *stops.borrow_and_update() != stream_id {
            stops
                .changed()
                .await
                .expect("the chat stop sender outlives every chat request");
        }
    }

    pub(crate) async fn shutdown(&self) -> Result<()> {
        let runtime = self.runtime.close();
        self.cancel();
        runtime
            .shutdown()
            .await
            .context("Failed to stop local Polish runtime")
    }

    /// Hands back only the resident weights — model stays installed and ready.
    pub(crate) async fn release_idle_runtime(&self) -> bool {
        let Some(runtime) = self.runtime.try_lease() else {
            return false;
        };
        runtime.release_if_idle().await
    }

    fn status(&self) -> PolishStatus {
        self.status_snapshot().status
    }

    fn active_model(&self) -> PolishModelDescriptor {
        self.status
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .model
    }

    pub(crate) fn supports_voice_commands(&self) -> bool {
        self.active_model().supports_voice_commands
    }

    fn status_snapshot(&self) -> PolishStatusSnapshot {
        self.status
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub(crate) async fn prepare(&self) -> Result<()> {
        self.prepared_runtime().await.map(drop)
    }

    pub(super) async fn prepared_runtime(&self) -> Result<RuntimeLease<'_, PolishRuntime>> {
        let _guard = self.preparation.lock().await;
        let runtime = self.runtime.lease().await;
        match polish_use_preparation(self.is_downloaded(), self.status().state) {
            PolishUsePreparation::MissingModel => {
                self.mark_not_downloaded();
                anyhow::bail!("Download the Polish model in Settings before using Polish");
            }
            PolishUsePreparation::EnsureRuntime => self.ensure_ready_runtime(&runtime).await?,
            PolishUsePreparation::VerifyAndLoad => {
                self.prepare_downloaded_runtime(&runtime).await?;
            }
        }
        Ok(runtime)
    }

    pub(crate) fn is_downloaded(&self) -> bool {
        self.models
            .get_model_info(self.active_model().id)
            .map(|model| model.is_downloaded)
            .unwrap_or(false)
    }

    async fn prepare_downloaded_runtime(&self, runtime: &PolishRuntime) -> Result<()> {
        let runtime_result = self.require_runtime();
        self.record_failure(PolishFailureStage::Runtime, runtime_result)?;
        self.set_status(PolishState::Verifying, "Verifying Polish model");
        let verify_result = self.verify_model(self.active_model().id).await;
        self.record_failure(PolishFailureStage::Verification, verify_result)?;
        let load_result = self.load_runtime(runtime).await;
        self.record_failure(PolishFailureStage::Loading, load_result)
    }

    async fn ensure_ready_runtime(&self, runtime: &PolishRuntime) -> Result<()> {
        let runtime_result = self.require_runtime();
        self.record_failure(PolishFailureStage::Runtime, runtime_result)?;
        let load_result = self.load_runtime(runtime).await;
        self.record_failure(PolishFailureStage::Loading, load_result)
    }

    /// A running model stays Ready: a Loading flash on every chat open blocks sending for nothing.
    async fn load_runtime(&self, runtime: &PolishRuntime) -> Result<()> {
        if !runtime.is_loaded().await {
            self.set_status(PolishState::Loading, "Loading Polish model");
        }
        runtime.ensure_ready().await?;
        self.set_status(PolishState::Ready, "Polish is ready");
        Ok(())
    }

    fn record_failure<T>(&self, stage: PolishFailureStage, result: Result<T>) -> Result<T> {
        if let Err(error) = &result {
            log::error!("Polish {stage:?} stage failed: {error:#}");
            let failure = polish_failure_status(stage);
            self.set_status(PolishState::Repair, failure.message);
        }
        result
    }

    fn require_runtime(&self) -> Result<()> {
        if let Some(error) = &self.initialization_error {
            anyhow::bail!("Polish setup is unavailable: {error}");
        }
        if !self.runtime_path.exists() {
            anyhow::bail!("Polish runtime is missing. Reinstall Echo to repair it");
        }
        Ok(())
    }

    pub(crate) async fn run(&self, generation: u64) {
        let transaction = match self.transaction() {
            Ok(transaction) => transaction,
            Err(error) => {
                show_warning_overlay(&self.app, &error.to_string());
                return;
            }
        };
        let captured = match captured_selection(&transaction, generation).await {
            Ok(Some(captured)) => captured,
            Ok(None) => return self.present_outcome(Ok(PolishOutcome::NoSelection), false),
            Err(error) => {
                show_warning_overlay(&self.app, &error.to_string());
                return;
            }
        };
        if !self.is_downloaded() {
            show_warning_overlay(
                &self.app,
                "Download the Polish model in Settings before using Option/Alt+1.",
            );
            return;
        }
        show_processing_overlay(&self.app, "Preparing Polish");
        let runtime = match self.prepared_runtime().await {
            Ok(runtime) => runtime,
            Err(error) => {
                log::error!("Polish preparation failed after selection capture: {error:#}");
                show_warning_overlay(&self.app, &polish_warning_message(&self.status()));
                return;
            }
        };
        show_processing_overlay(&self.app, "Polishing…");
        let instruction = settings::get_settings(&self.app).polish_instruction();
        let outcome = transaction
            .complete(captured, generation, &instruction, &*runtime)
            .await;
        let should_repair = outcome.is_err() && runtime.requires_repair().await;
        self.present_outcome(outcome, should_repair);
    }

    fn transaction(&self) -> Result<PolishTransaction> {
        self.transaction_with_cancellation(self.cancellation.clone())
    }

    fn transaction_with_cancellation(
        &self,
        cancellation: Arc<CancellationClock>,
    ) -> Result<PolishTransaction> {
        Ok(PolishTransaction::new(PolishTransactionPorts {
            clipboard: Arc::new(PlatformClipboard::new()?),
            clipboard_access: self.clipboard_access.clone(),
            keyboard: Arc::new(PlatformKeyboard),
            focus: Arc::new(PlatformFocus),
            cancellation,
        }))
    }

    fn present_outcome(&self, outcome: Result<PolishOutcome>, should_repair: bool) {
        if let Err(error) = &outcome {
            log::warn!("Polish completion failed; selected text was left unchanged: {error:#}");
        }
        if should_repair {
            let failure = polish_failure_status(PolishFailureStage::Loading);
            self.set_status(PolishState::Repair, failure.message);
            show_warning_overlay(&self.app, failure.message);
            return;
        }
        match outcome {
            Ok(PolishOutcome::Replaced) => show_tool_overlay(&self.app, "Polished"),
            Ok(PolishOutcome::Copied) => show_tool_overlay(&self.app, "Polished text copied"),
            Ok(PolishOutcome::Unchanged) => show_tool_overlay(&self.app, "No changes"),
            Ok(PolishOutcome::NoSelection) => show_warning_overlay(&self.app, "No text selected"),
            Err(error) => show_warning_overlay(&self.app, &error.to_string()),
        }
    }

    fn set_status(&self, state: PolishState, message: &str) {
        self.publish_status(
            self.active_model(),
            PolishStatus {
                state,
                message: message.to_string(),
            },
        );
    }

    fn publish_status(&self, model: PolishModelDescriptor, status: PolishStatus) {
        let snapshot = PolishStatusSnapshot { model, status };
        *self
            .status
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = snapshot.clone();
        let _ = self.app.emit("polish-status-changed", snapshot);
    }
}

#[tauri::command]
pub(crate) fn get_polish_status(
    manager: tauri::State<'_, Arc<PolishManager>>,
) -> PolishStatusSnapshot {
    manager.status_snapshot()
}

#[tauri::command]
pub(crate) fn get_polish_models(
    manager: tauri::State<'_, Arc<PolishManager>>,
) -> Result<PolishModelCatalog, String> {
    manager
        .model_catalog()
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub(crate) async fn select_polish_model(
    manager: tauri::State<'_, Arc<PolishManager>>,
    model_id: String,
) -> Result<(), String> {
    manager
        .select_model(&model_id)
        .await
        .map_err(|error| language_model_message(&error))
}

#[tauri::command]
pub(crate) async fn chat_with_polish_model(
    manager: tauri::State<'_, Arc<PolishManager>>,
    stream_id: String,
    system: String,
    messages: Vec<BundledChatMessage>,
    model_id: Option<String>,
    thinking: Option<bool>,
) -> Result<String, String> {
    manager
        .chat(
            &stream_id,
            &system,
            &messages,
            model_id.as_deref(),
            thinking.unwrap_or(false),
        )
        .await
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub(crate) fn stop_polish_chat(manager: tauri::State<'_, Arc<PolishManager>>, stream_id: String) {
    manager.stop_chat(&stream_id);
}

#[tauri::command]
pub(crate) async fn download_polish_model(
    manager: tauri::State<'_, Arc<PolishManager>>,
) -> Result<(), String> {
    manager
        .download()
        .await
        .map_err(|error| language_model_message(&error))
}

#[tauri::command]
pub(crate) async fn repair_polish_model(
    manager: tauri::State<'_, Arc<PolishManager>>,
) -> Result<(), String> {
    manager
        .repair()
        .await
        .map_err(|error| language_model_message(&error))
}

#[cfg(test)]
mod selection_read_tests {
    use super::*;

    /// An accessibility selection must reach Polish exactly like a copied one.
    #[test]
    fn accessibility_and_copy_reads_hand_back_the_same_text() {
        assert_eq!(
            SelectionRead::Selected("cargo test".to_owned())
                .text()
                .unwrap(),
            Some("cargo test".to_owned())
        );
        assert_eq!(
            SelectionRead::Copied {
                mode: SelectionMode::ReplaceSelection,
                text: Some("cargo test".to_owned()),
            }
            .text()
            .unwrap(),
            Some("cargo test".to_owned())
        );
    }

    #[test]
    fn an_unanswered_copy_reads_as_nothing_selected_and_a_refused_read_as_a_fault() {
        assert_eq!(
            SelectionRead::Copied {
                mode: SelectionMode::ReplaceSelection,
                text: None,
            }
            .text()
            .unwrap(),
            None
        );
        assert_eq!(SelectionRead::NothingSelected.text().unwrap(), None);
        assert_eq!(
            SelectionRead::PermissionRequired
                .text()
                .unwrap_err()
                .to_string(),
            "Accessibility access is needed to read the selection"
        );
    }
}
