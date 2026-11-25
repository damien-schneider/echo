use anyhow::{Context, Result};

use super::super::{
    polish_preparation_plan, PolishFailureStage, PolishPreparationIntent, PolishPreparationPlan,
    PolishState,
};
use super::model_failure::failed_at;
use super::PolishManager;
use super::PolishRuntime;

impl PolishManager {
    pub(super) async fn repair(&self) -> Result<()> {
        let operation = self.begin_model_operation(None)?;
        self.wait_and_prepare_explicit(PolishPreparationIntent::Repair, operation.id)
            .await
    }

    pub(super) async fn download(&self) -> Result<()> {
        let operation = self.begin_model_operation(None)?;
        self.prepare_selection(operation.id).await
    }

    pub(super) async fn prepare_selection(&self, model_id: &'static str) -> Result<()> {
        self.wait_and_prepare_explicit(PolishPreparationIntent::Download, model_id)
            .await
    }

    async fn wait_and_prepare_explicit(
        &self,
        intent: PolishPreparationIntent,
        model_id: &'static str,
    ) -> Result<()> {
        let _guard = self.preparation.lock().await;
        if intent.reuses_ready_status() && self.status().state == PolishState::Ready {
            return Ok(());
        }
        let runtime = self.runtime.exclusive().await?;
        if intent.resets_runtime() {
            let reset_result = runtime.reset().await;
            self.record_step(PolishFailureStage::Runtime, reset_result)?;
        }
        if intent.rehashes_installed_model() {
            self.models.forget_verification(model_id);
        }
        let runtime_result = self.require_runtime();
        self.record_step(PolishFailureStage::Runtime, runtime_result)?;
        let plan = self.preparation_plan(model_id);
        self.set_preparation_status(plan);
        runtime
            .unless_closed(self.prepare_explicit(plan, model_id, &runtime))
            .await
    }

    fn record_step<T>(&self, stage: PolishFailureStage, result: Result<T>) -> Result<T> {
        self.record_failure(stage, result)
            .map_err(|error| failed_at(stage, error))
    }

    async fn prepare_explicit(
        &self,
        plan: PolishPreparationPlan,
        model_id: &'static str,
        runtime: &PolishRuntime,
    ) -> Result<()> {
        if !plan.requires_preload_verification() {
            return self.download_and_load(model_id, runtime).await;
        }
        if let Err(error) = self.verify_model(model_id).await {
            log::warn!("Discarding invalid Polish model before repair: {error:#}");
            let delete_result = self
                .models
                .delete_model(model_id)
                .context("Failed to discard invalid Polish model");
            self.record_step(PolishFailureStage::Verification, delete_result)?;
            self.set_status(PolishState::Downloading, "Downloading Polish model");
            return self.download_and_load(model_id, runtime).await;
        }
        let load_result = self.load_runtime(runtime).await;
        self.record_step(PolishFailureStage::Loading, load_result)
    }

    async fn download_and_load(&self, model_id: &str, runtime: &PolishRuntime) -> Result<()> {
        let download_result = self.models.download_model(model_id).await;
        self.record_step(PolishFailureStage::Download, download_result)?;
        let load_result = self.load_runtime(runtime).await;
        self.record_step(PolishFailureStage::Loading, load_result)
    }

    fn preparation_plan(&self, model_id: &str) -> PolishPreparationPlan {
        self.models
            .get_model_info(model_id)
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
