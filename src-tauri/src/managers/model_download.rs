use super::model::*;
#[path = "model_download_attempt.rs"]
mod attempt;
mod install;
mod progress;
pub(super) mod receipt;
mod recovery;
pub(super) mod verification;
use anyhow::{Context, Result};
use attempt::DownloadAttempt;
use futures_util::StreamExt;
use progress::{progress_for, ProgressCadence};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::Emitter;
struct DownloadPaths {
    model: PathBuf,
    partial: PathBuf,
    extracting: PathBuf,
}

impl DownloadPaths {
    fn new(models_dir: &Path, filename: &str) -> Self {
        Self {
            model: models_dir.join(filename),
            partial: models_dir.join(format!("{filename}.partial")),
            extracting: models_dir.join(format!("{filename}.extracting")),
        }
    }
}

struct DownloadContext {
    model: ModelInfo,
    url: String,
    paths: DownloadPaths,
}

struct DownloadResponse {
    response: reqwest::Response,
    resume_from: u64,
    total_size: u64,
}

fn download_client(stall_timeout: Duration) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(stall_timeout)
        .build()
        .map_err(Into::into)
}

impl ModelManager {
    pub(crate) async fn download_model(&self, model_id: &str) -> Result<()> {
        let context = self.download_context(model_id)?;
        let mut attempt = DownloadAttempt::start(self, model_id)?;
        if self.recover_existing_download(&context)? {
            self.finish_download(model_id)?;
            attempt.complete();
            log::info!("Recovered completed model {model_id}");
            return Ok(());
        }
        attempt.mark_transfer_started();
        let response = self.send_download_request(&context).await?;
        self.write_download(&context, response).await?;
        self.install_download(&context)?;
        self.finish_download(model_id)?;
        attempt.complete();
        log::info!(
            "Successfully downloaded model {model_id} to {:?}",
            context.paths.model
        );
        Ok(())
    }

    fn download_context(&self, model_id: &str) -> Result<DownloadContext> {
        let model = self
            .available_models
            .lock()
            .map_err(|_| anyhow::anyhow!("Model catalog lock is poisoned"))?
            .get(model_id)
            .cloned()
            .with_context(|| format!("Model not found: {model_id}"))?;
        let url = model.url.clone().context("No download URL for model")?;
        let paths = DownloadPaths::new(&self.models_dir, &model.filename);
        Ok(DownloadContext { model, url, paths })
    }

    async fn send_download_request(&self, context: &DownloadContext) -> Result<DownloadResponse> {
        let mut resume_from = resume_offset(context);
        let client = download_client(Duration::from_secs(45))?;
        let mut request = client.get(&context.url);
        if resume_from > 0 {
            request = request.header("Range", format!("bytes={resume_from}-"));
        }
        let response = request.send().await?;
        if !response.status().is_success() {
            anyhow::bail!("Failed to download model: HTTP {}", response.status());
        }
        if resume_from > 0 && response.status() != reqwest::StatusCode::PARTIAL_CONTENT {
            log::warn!(
                "Server ignored range request for {}; restarting download",
                context.model.id
            );
            resume_from = 0;
        }
        let total_size = download_total_size(
            resume_from,
            response.content_length(),
            context.model.size_bytes,
        );
        Ok(DownloadResponse {
            response,
            resume_from,
            total_size,
        })
    }

    async fn write_download(
        &self,
        context: &DownloadContext,
        response: DownloadResponse,
    ) -> Result<()> {
        let mut downloaded = response.resume_from;
        let mut file = open_partial_file(&context.paths.partial, downloaded)?;
        let started = Instant::now();
        let mut cadence = ProgressCadence::default();
        let emit_current_progress = |downloaded| {
            self.emit_progress(progress_for(
                &context.model.id,
                downloaded,
                response.total_size,
            ));
        };
        if cadence.should_emit(started.elapsed(), false) {
            emit_current_progress(downloaded);
        }
        let mut stream = response.response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk)?;
            downloaded += chunk.len() as u64;
            if cadence.should_emit(started.elapsed(), false) {
                emit_current_progress(downloaded);
            }
        }
        file.flush()?;
        if cadence.should_emit(started.elapsed(), true) {
            emit_current_progress(downloaded);
        }
        Ok(())
    }

    fn emit_progress(&self, progress: DownloadProgress) {
        let _ = self.app_handle.emit("model-download-progress", progress);
    }

    fn finish_download(&self, model_id: &str) -> Result<()> {
        let mut models = self
            .available_models
            .lock()
            .map_err(|_| anyhow::anyhow!("Model catalog lock is poisoned"))?;
        if let Some(model) = models.get_mut(model_id) {
            model.is_downloading = false;
            model.is_downloaded = true;
            model.partial_size = 0;
        }
        drop(models);
        let _ = self.app_handle.emit("model-download-complete", model_id);
        Ok(())
    }
}

fn resume_offset(context: &DownloadContext) -> u64 {
    let Ok(metadata) = context.paths.partial.metadata() else {
        log::info!(
            "Starting fresh download of model {} from {}",
            context.model.id,
            context.url
        );
        return 0;
    };
    let size = metadata.len();
    log::info!(
        "Resuming download of model {} from byte {size}",
        context.model.id
    );
    size
}

fn open_partial_file(path: &Path, resume_from: u64) -> Result<File> {
    if resume_from == 0 {
        return File::create(path).map_err(Into::into);
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(Into::into)
}

fn download_total_size(resume_from: u64, content_length: Option<u64>, expected_size: u64) -> u64 {
    if resume_from > 0 {
        return content_length
            .map(|remaining| resume_from + remaining)
            .unwrap_or(expected_size.max(resume_from));
    }
    content_length.unwrap_or(expected_size)
}

#[cfg(test)]
#[path = "model_download_tests.rs"]
mod tests;
