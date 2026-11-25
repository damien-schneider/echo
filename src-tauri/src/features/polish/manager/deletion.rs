use anyhow::{Context, Result};

use super::model_selection::polish_model;

use super::super::polish_status_for_availability;
use super::PolishManager;

impl PolishManager {
    pub(crate) async fn delete_model(&self, id: &str) -> Result<()> {
        let model = polish_model(id).context("Unknown language model")?;
        let _operation = self.begin_model_operation(Some(model.id))?;
        if self.status_snapshot().model.id != model.id {
            return self.models.delete_model(model.id);
        }
        let _preparation = self.preparation.lock().await;
        let runtime = self.runtime.exclusive().await?;
        runtime
            .reset()
            .await
            .context("Failed to stop the local model before deleting it")?;
        self.models.delete_model(model.id)?;
        self.mark_not_downloaded();
        Ok(())
    }

    pub(super) fn mark_not_downloaded(&self) {
        let status = polish_status_for_availability(false);
        self.set_status(status.state, &status.message);
    }
}
