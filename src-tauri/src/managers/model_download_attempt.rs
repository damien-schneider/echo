#[cfg(test)]
use super::DownloadPaths;
use super::ModelManager;
use anyhow::{Context, Result};
use tauri::Emitter;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg(test)]
pub(super) enum DownloadPhase {
    Downloading,
    Verifying,
}

#[cfg(test)]
pub(super) fn download_phase(
    paths: &DownloadPaths,
    expected_size: u64,
    is_directory: bool,
) -> Result<DownloadPhase> {
    if paths.model.exists() {
        return Ok(DownloadPhase::Verifying);
    }
    if is_directory || expected_size == 0 || !paths.partial.exists() {
        return Ok(DownloadPhase::Downloading);
    }
    if paths.partial.metadata()?.len() >= expected_size {
        return Ok(DownloadPhase::Verifying);
    }
    Ok(DownloadPhase::Downloading)
}

pub(super) fn attempt_failure_event(completed: bool, transfer_started: bool) -> bool {
    !completed && transfer_started
}

pub(super) struct DownloadAttempt<'a> {
    manager: &'a ModelManager,
    model_id: &'a str,
    completed: bool,
    transfer_started: bool,
}

impl<'a> DownloadAttempt<'a> {
    pub(super) fn start(manager: &'a ModelManager, model_id: &'a str) -> Result<Self> {
        let mut models = manager
            .available_models
            .lock()
            .map_err(|_| anyhow::anyhow!("Model catalog lock is poisoned"))?;
        let model = models
            .get_mut(model_id)
            .with_context(|| format!("Model not found: {model_id}"))?;
        if model.is_downloading {
            anyhow::bail!("Model download is already in progress: {model_id}");
        }
        model.is_downloading = true;
        drop(models);
        Ok(Self {
            manager,
            model_id,
            completed: false,
            transfer_started: false,
        })
    }

    pub(super) fn mark_transfer_started(&mut self) {
        self.transfer_started = true;
    }

    pub(super) fn complete(mut self) {
        self.completed = true;
    }
}

impl Drop for DownloadAttempt<'_> {
    fn drop(&mut self) {
        if self.completed {
            return;
        }
        if let Ok(mut models) = self.manager.available_models.lock() {
            if let Some(model) = models.get_mut(self.model_id) {
                model.is_downloading = false;
            }
        }
        if attempt_failure_event(self.completed, self.transfer_started) {
            let _ = self
                .manager
                .app_handle
                .emit("model-download-failed", self.model_id);
        }
    }
}
