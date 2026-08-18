use anyhow::{Context, Result};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

mod setup;

use crate::managers::model::{ModelManager, POLISH_MODEL_ID};
use crate::overlay::{show_processing_overlay, show_tool_overlay, show_warning_overlay};

use super::platform::{
    read_selected_text, DirectSelection, PlatformClipboard, PlatformFocus, PlatformKeyboard,
};
use super::runtime::PolishRuntime;
use super::selection::{
    CancellationClock, PolishOutcome, PolishTransaction, PolishTransactionPorts, SelectionMode,
};
use super::{
    polish_failure_status, polish_failure_updates_shared_status, polish_joins_active_operation,
    polish_preparation_plan, polish_use_preparation, polish_warning_message, BundledChatMessage,
    PolishFailureStage, PolishPreparationIntent, PolishPreparationPlan, PolishState, PolishStatus,
    PolishUsePreparation,
};
use setup::{polish_initialization, polish_runtime_config, selection_mode};

const MAX_CHAT_CONTEXT_CHARACTERS: usize = 20_000;
const CHAT_ANSWER_EVENT: &str = "polish-chat-answer";

#[derive(Clone, Debug, Serialize)]
struct ChatAnswerEvent {
    answer: String,
    stream_id: String,
}

fn chat_text_context(text: String, source: ChatContextSource) -> ChatTextContext {
    let (text, truncated) = clipped_chat_text(text);
    ChatTextContext {
        source,
        text,
        truncated,
    }
}

fn clipped_chat_text(text: String) -> (String, bool) {
    let Some((byte_index, _)) = text.char_indices().nth(MAX_CHAT_CONTEXT_CHARACTERS) else {
        return (text, false);
    };
    (text[..byte_index].to_owned(), true)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ChatContextSource {
    Clipboard,
    Selection,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct ChatTextContext {
    pub(crate) source: ChatContextSource,
    pub(crate) truncated: bool,
    pub(crate) text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ChatContextCapture {
    PermissionRequired,
    Ready(Option<ChatTextContext>),
    Unavailable,
}

pub(crate) struct PolishManager {
    app: AppHandle,
    models: Arc<ModelManager>,
    runtime: Arc<PolishRuntime>,
    runtime_path: PathBuf,
    initialization_error: Option<String>,
    cancellation: Arc<CancellationClock>,
    clipboard_access: Arc<tokio::sync::Mutex<()>>,
    chat_cancellation: Arc<CancellationClock>,
    chat_stop: watch::Sender<String>,
    status: Mutex<PolishStatus>,
    preparation: tokio::sync::Mutex<()>,
}

impl PolishManager {
    pub(crate) fn new(app: &AppHandle, models: Arc<ModelManager>) -> Self {
        let is_downloaded = models
            .get_model_info(POLISH_MODEL_ID)
            .map(|model| model.is_downloaded)
            .unwrap_or(false);
        let initialization =
            polish_initialization(polish_runtime_config(app, &models), is_downloaded);
        let runtime_path = initialization.config.server_path.clone();
        Self {
            app: app.clone(),
            models,
            runtime: Arc::new(PolishRuntime::new(initialization.config)),
            runtime_path,
            initialization_error: initialization.error,
            clipboard_access: Arc::new(tokio::sync::Mutex::new(())),
            cancellation: Arc::new(CancellationClock::default()),
            chat_cancellation: Arc::new(CancellationClock::default()),
            chat_stop: watch::channel(String::new()).0,
            status: Mutex::new(initialization.status),
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

    pub(crate) fn begin_chat_context_capture(&self) -> u64 {
        self.chat_cancellation.begin()
    }

    pub(crate) async fn capture_chat_context(&self, generation: u64) -> Result<ChatContextCapture> {
        let observed = self.observe_chat_context()?;
        if observed != ChatContextCapture::Unavailable {
            return Ok(observed);
        }
        let mode = selection_mode();
        let transaction = self.transaction_with_cancellation(self.chat_cancellation.clone())?;
        let context = transaction
            .capture_text(mode, generation)
            .await?
            .map(|text| {
                let source = match mode {
                    SelectionMode::ReplaceSelection => ChatContextSource::Selection,
                    SelectionMode::ClipboardOnly => ChatContextSource::Clipboard,
                };
                chat_text_context(text, source)
            });
        Ok(ChatContextCapture::Ready(context))
    }

    pub(crate) fn observe_chat_context(&self) -> Result<ChatContextCapture> {
        Ok(match read_selected_text()? {
            DirectSelection::Empty => ChatContextCapture::Ready(None),
            DirectSelection::PermissionRequired => ChatContextCapture::PermissionRequired,
            DirectSelection::Text(text) => ChatContextCapture::Ready(Some(chat_text_context(
                text,
                ChatContextSource::Selection,
            ))),
            DirectSelection::Unavailable => ChatContextCapture::Unavailable,
        })
    }

    pub(crate) async fn chat(
        &self,
        stream_id: &str,
        system: &str,
        messages: &[BundledChatMessage],
    ) -> Result<String> {
        if system.trim().is_empty() || messages.is_empty() {
            anyhow::bail!("Chat request is empty");
        }
        self.prepare()
            .await
            .context("Failed to prepare Echo 4B for chat")?;
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
            answer = self.runtime.chat(system, messages, &publish) => answer,
            () = self.await_chat_stop(stream_id) => anyhow::bail!("Echo chat was stopped"),
        }
    }

    pub(crate) fn stop_chat(&self, stream_id: &str) {
        let _ = self.chat_stop.send(stream_id.to_owned());
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
        self.cancel();
        self.runtime
            .shutdown()
            .await
            .context("Failed to stop local Polish runtime")
    }

    /// Hands back only the resident weights — model stays installed and ready.
    pub(crate) async fn release_idle_runtime(&self) -> bool {
        self.runtime.release_if_idle().await
    }

    fn status(&self) -> PolishStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or(PolishStatus {
                state: PolishState::Repair,
                message: "Polish status unavailable".to_string(),
            })
    }

    pub(crate) async fn prepare(&self) -> Result<()> {
        let _guard = self.preparation.lock().await;
        match polish_use_preparation(self.is_downloaded(), self.status().state) {
            PolishUsePreparation::MissingModel => {
                self.set_status(
                    PolishState::NotDownloaded,
                    "Download the local Polish model to enable proofreading.",
                );
                anyhow::bail!("Download the Polish model in Settings before using Polish");
            }
            PolishUsePreparation::EnsureRuntime => self.ensure_ready_runtime().await,
            PolishUsePreparation::VerifyAndLoad => self.prepare_downloaded_runtime().await,
        }
    }

    async fn repair(&self) -> Result<()> {
        self.wait_and_prepare_explicit(PolishPreparationIntent::Repair)
            .await
    }

    async fn download(&self) -> Result<()> {
        self.wait_and_prepare_explicit(PolishPreparationIntent::Download)
            .await
    }

    async fn wait_and_prepare_explicit(&self, intent: PolishPreparationIntent) -> Result<()> {
        let Some(_guard) = self.acquire_preparation().await? else {
            return Ok(());
        };
        if intent.reuses_ready_status() && self.status().state == PolishState::Ready {
            return Ok(());
        }
        if intent.resets_runtime() {
            let reset_result = self.runtime.reset().await;
            self.record_failure(PolishFailureStage::Runtime, reset_result)?;
        }
        let runtime_result = self.require_runtime();
        self.record_failure(PolishFailureStage::Runtime, runtime_result)?;
        let plan = self.preparation_plan();
        self.set_preparation_status(plan);
        self.prepare_explicit(plan).await
    }

    /// `None` — another task owns the operation; its status events are the answer.
    async fn acquire_preparation(&self) -> Result<Option<tokio::sync::MutexGuard<'_, ()>>> {
        if let Ok(guard) = self.preparation.try_lock() {
            return Ok(Some(guard));
        }
        if polish_joins_active_operation(self.status().state) {
            log::info!("Joining the Polish operation already in flight");
            return Ok(None);
        }
        let wait_result = tokio::time::timeout(Duration::from_secs(75), self.preparation.lock())
            .await
            .context("Timed out waiting for another Polish operation");
        self.record_failure(PolishFailureStage::Waiting, wait_result)
            .map(Some)
    }

    async fn prepare_explicit(&self, plan: PolishPreparationPlan) -> Result<()> {
        if !plan.requires_preload_verification() {
            return self.download_and_load().await;
        }
        if let Err(error) = self.models.verify_downloaded_model(POLISH_MODEL_ID) {
            log::warn!("Discarding invalid Polish model before repair: {error:#}");
            let delete_result = self
                .models
                .delete_model(POLISH_MODEL_ID)
                .context("Failed to discard invalid Polish model");
            self.record_failure(PolishFailureStage::Verification, delete_result)?;
            self.set_status(PolishState::Downloading, "Downloading Polish model");
            return self.download_and_load().await;
        }
        let load_result = self.load_runtime().await;
        self.record_failure(PolishFailureStage::Loading, load_result)
    }

    pub(crate) fn is_downloaded(&self) -> bool {
        self.models
            .get_model_info(POLISH_MODEL_ID)
            .map(|model| model.is_downloaded)
            .unwrap_or(false)
    }

    async fn download_and_load(&self) -> Result<()> {
        let download_result = self.models.download_model(POLISH_MODEL_ID).await;
        self.record_failure(PolishFailureStage::Download, download_result)?;
        let load_result = self.load_runtime().await;
        self.record_failure(PolishFailureStage::Loading, load_result)
    }

    async fn prepare_downloaded_runtime(&self) -> Result<()> {
        let runtime_result = self.require_runtime();
        self.record_failure(PolishFailureStage::Runtime, runtime_result)?;
        self.set_status(PolishState::Verifying, "Verifying Polish model");
        let verify_result = self.models.verify_downloaded_model(POLISH_MODEL_ID);
        self.record_failure(PolishFailureStage::Verification, verify_result)?;
        let load_result = self.load_runtime().await;
        self.record_failure(PolishFailureStage::Loading, load_result)
    }

    async fn ensure_ready_runtime(&self) -> Result<()> {
        let runtime_result = self.require_runtime();
        self.record_failure(PolishFailureStage::Runtime, runtime_result)?;
        let load_result = self.load_runtime().await;
        self.record_failure(PolishFailureStage::Loading, load_result)
    }

    async fn load_runtime(&self) -> Result<()> {
        self.set_status(PolishState::Loading, "Loading Polish model");
        self.runtime.ensure_ready().await?;
        self.set_status(PolishState::Ready, "Polish is ready");
        Ok(())
    }

    fn preparation_plan(&self) -> PolishPreparationPlan {
        self.models
            .get_model_info(POLISH_MODEL_ID)
            .map(|model| {
                polish_preparation_plan(model.is_downloaded, model.partial_size, model.size_bytes)
            })
            .unwrap_or(PolishPreparationPlan::Download)
    }

    fn set_preparation_status(&self, plan: PolishPreparationPlan) {
        match plan {
            PolishPreparationPlan::Download => {
                self.set_status(PolishState::Downloading, "Downloading Polish model");
            }
            PolishPreparationPlan::VerifyInstalled | PolishPreparationPlan::RecoverDownload => {
                self.set_status(PolishState::Verifying, "Verifying Polish model");
            }
        }
    }

    fn record_failure<T>(&self, stage: PolishFailureStage, result: Result<T>) -> Result<T> {
        if let Err(error) = &result {
            log::error!("Polish {stage:?} stage failed: {error:#}");
            if polish_failure_updates_shared_status(stage) {
                let failure = polish_failure_status(stage);
                self.set_status(PolishState::Repair, failure.message);
            }
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
        let captured = match transaction.capture(selection_mode(), generation).await {
            Ok(Some(captured)) => captured,
            Ok(None) => return self.present_outcome(Ok(PolishOutcome::NoSelection)).await,
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
        if let Err(error) = self.prepare().await {
            log::error!("Polish preparation failed after selection capture: {error:#}");
            show_warning_overlay(&self.app, &polish_warning_message(&self.status()));
            return;
        }
        show_processing_overlay(&self.app, "Polishing…");
        let outcome = transaction.complete(captured, generation).await;
        self.present_outcome(outcome).await;
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
            inference: self.runtime.clone(),
            cancellation,
        }))
    }

    async fn present_outcome(&self, outcome: Result<PolishOutcome>) {
        if let Err(error) = &outcome {
            log::warn!("Polish completion failed; selected text was left unchanged: {error:#}");
        }
        if outcome.is_err() && self.runtime.requires_repair().await {
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
        let status = PolishStatus {
            state,
            message: message.to_string(),
        };
        if let Ok(mut current) = self.status.lock() {
            *current = status.clone();
        }
        let _ = self.app.emit("polish-status-changed", status);
    }
}

#[cfg(test)]
mod chat_context_tests {
    use super::{clipped_chat_text, MAX_CHAT_CONTEXT_CHARACTERS};

    #[test]
    fn clips_chat_context_on_character_boundaries() {
        let (short, short_was_clipped) = clipped_chat_text("short".to_string());
        assert_eq!(short, "short");
        assert!(!short_was_clipped);

        let (long, long_was_clipped) =
            clipped_chat_text("é".repeat(MAX_CHAT_CONTEXT_CHARACTERS + 1));
        assert_eq!(long.chars().count(), MAX_CHAT_CONTEXT_CHARACTERS);
        assert!(long_was_clipped);
    }
}

#[tauri::command]
pub(crate) fn get_polish_status(manager: tauri::State<'_, Arc<PolishManager>>) -> PolishStatus {
    manager.status()
}

#[tauri::command]
pub(crate) async fn chat_with_polish_model(
    manager: tauri::State<'_, Arc<PolishManager>>,
    stream_id: String,
    system: String,
    messages: Vec<BundledChatMessage>,
) -> Result<String, String> {
    manager
        .chat(&stream_id, &system, &messages)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn stop_polish_chat(manager: tauri::State<'_, Arc<PolishManager>>, stream_id: String) {
    manager.stop_chat(&stream_id);
}

#[tauri::command]
pub(crate) async fn download_polish_model(
    manager: tauri::State<'_, Arc<PolishManager>>,
) -> Result<(), String> {
    manager.download().await.map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn repair_polish_model(
    manager: tauri::State<'_, Arc<PolishManager>>,
) -> Result<(), String> {
    manager.repair().await.map_err(|error| error.to_string())
}
