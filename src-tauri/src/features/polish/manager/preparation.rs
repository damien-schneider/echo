use anyhow::{Context, Result};
use std::time::Duration;

use crate::managers::model::POLISH_MODEL_ID;

use super::super::{
    polish_joins_active_operation, polish_preparation_plan, PolishFailureStage,
    PolishPreparationIntent, PolishPreparationPlan, PolishState,
};
use super::PolishManager;

impl PolishManager {
    pub(super) async fn repair(&self) -> Result<()> {
        self.wait_and_prepare_explicit(PolishPreparationIntent::Repair)
            .await
    }

    pub(super) async fn download(&self) -> Result<()> {
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
        if intent.rehashes_installed_model() {
            self.models.forget_verification(POLISH_MODEL_ID);
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

    async fn download_and_load(&self) -> Result<()> {
        let download_result = self.models.download_model(POLISH_MODEL_ID).await;
        self.record_failure(PolishFailureStage::Download, download_result)?;
        let load_result = self.load_runtime().await;
        self.record_failure(PolishFailureStage::Loading, load_result)
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
}
