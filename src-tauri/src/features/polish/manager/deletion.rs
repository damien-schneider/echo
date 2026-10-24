use anyhow::{Context, Result};

use crate::managers::model::POLISH_MODEL_ID;

use super::super::polish_status_for_availability;
use super::PolishManager;

impl PolishManager {
    /// Waits out a download or load, then stops the server before its weights file goes.
    pub(crate) async fn delete_model(&self) -> Result<()> {
        let _preparation = self.preparation.lock().await;
        self.runtime
            .reset()
            .await
            .context("Failed to stop the local model before deleting it")?;
        self.models.delete_model(POLISH_MODEL_ID)?;
        self.mark_not_downloaded();
        Ok(())
    }

    pub(super) fn mark_not_downloaded(&self) {
        let status = polish_status_for_availability(false);
        self.set_status(status.state, &status.message);
    }
}
