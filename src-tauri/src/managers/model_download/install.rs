use super::receipt;
use super::recovery::{partial_recovery, PartialRecovery};
use super::verification::VerificationTarget;
use super::{DownloadContext, DownloadPaths};
use crate::managers::model::ModelManager;
use anyhow::{Context, Result};
use bzip2::read::BzDecoder;
use flate2::read::GzDecoder;
use std::fs::{self, File};
use std::path::Path;
use tar::Archive;
use tauri::Emitter;

impl ModelManager {
    pub(crate) fn verify_downloaded_model(&self, model_id: &str) -> Result<()> {
        let model = self
            .get_model_info(model_id)
            .with_context(|| format!("Model not found: {model_id}"))?;
        let path = self.models_dir.join(&model.filename);
        if !path.exists() {
            anyhow::bail!("Model is not downloaded: {model_id}");
        }
        if model.size_bytes > 0 && path.metadata()?.len() != model.size_bytes {
            anyhow::bail!("Downloaded model has an invalid size: {model_id}");
        }
        if let Some(sha256) = model.sha256.as_deref() {
            self.verify_installed_artifact(VerificationTarget {
                expected_sha256: sha256,
                model_id,
                path: &path,
            })?;
        }
        Ok(())
    }

    /// Hashed once, then answered from its receipt — a 2.5 GB checksum per launch costs more than it guards.
    fn verify_installed_artifact(&self, target: VerificationTarget<'_>) -> Result<()> {
        if receipt::artifact_is_verified(target.path, target.expected_sha256) {
            log::debug!(
                "Model {} is unchanged since its last verification",
                target.model_id
            );
            return Ok(());
        }
        self.verify_model_file(target)?;
        self.record_verification(target.path, target.expected_sha256);
        Ok(())
    }

    fn record_verification(&self, path: &Path, expected_sha256: &str) {
        if let Err(error) = receipt::write_receipt(path, expected_sha256) {
            log::warn!("Could not record a verification receipt: {error:#}");
        }
    }

    pub(super) fn recover_existing_download(&self, context: &DownloadContext) -> Result<bool> {
        if context.paths.model.exists() {
            if self.installed_artifact_is_intact(context) {
                remove_file_if_present(&context.paths.partial);
                return Ok(true);
            }
            log::warn!("Removing corrupt model file for {}", context.model.id);
            receipt::remove_receipt(&context.paths.model);
            fs::remove_file(&context.paths.model)?;
        }
        self.recover_completed_partial(context)
    }

    fn installed_artifact_is_intact(&self, context: &DownloadContext) -> bool {
        let Some(hash) = context.model.sha256.as_deref() else {
            return true;
        };
        self.verify_installed_artifact(VerificationTarget {
            expected_sha256: hash,
            model_id: &context.model.id,
            path: &context.paths.model,
        })
        .is_ok()
    }

    fn recover_completed_partial(&self, context: &DownloadContext) -> Result<bool> {
        if context.model.is_directory || !context.paths.partial.exists() {
            return Ok(false);
        }
        let partial_size = context.paths.partial.metadata()?.len();
        match partial_recovery(partial_size, context.model.size_bytes) {
            PartialRecovery::Resume => Ok(false),
            PartialRecovery::Discard => {
                log::warn!(
                    "Discarding an oversized partial download for {}",
                    context.model.id
                );
                fs::remove_file(&context.paths.partial)?;
                Ok(false)
            }
            PartialRecovery::Verify => self.install_complete_partial(context),
        }
    }

    fn install_complete_partial(&self, context: &DownloadContext) -> Result<bool> {
        let hash = context.model.sha256.as_deref();
        if !self.partial_matches_checksum(context, hash) {
            log::warn!(
                "Discarding a corrupt complete partial for {}",
                context.model.id
            );
            fs::remove_file(&context.paths.partial)?;
            return Ok(false);
        }
        fs::rename(&context.paths.partial, &context.paths.model)?;
        if let Some(hash) = hash {
            self.record_verification(&context.paths.model, hash);
        }
        Ok(true)
    }

    fn partial_matches_checksum(&self, context: &DownloadContext, hash: Option<&str>) -> bool {
        let Some(hash) = hash else {
            return true;
        };
        self.verify_model_file(VerificationTarget {
            expected_sha256: hash,
            model_id: &context.model.id,
            path: &context.paths.partial,
        })
        .is_ok()
    }

    pub(super) fn install_download(&self, context: &DownloadContext) -> Result<()> {
        if context.model.is_directory {
            return self.extract_download(context);
        }
        self.install_model_file(context)
    }

    fn extract_download(&self, context: &DownloadContext) -> Result<()> {
        let _ = self
            .app_handle
            .emit("model-extraction-started", &context.model.id);
        remove_directory_if_present(&context.paths.extracting)?;
        fs::create_dir_all(&context.paths.extracting)?;
        if let Err(error) = unpack_archive(context) {
            remove_directory_if_present(&context.paths.extracting)?;
            let message = format!("Failed to extract archive: {error}");
            let payload = serde_json::json!({"model_id": context.model.id, "error": message});
            let _ = self.app_handle.emit("model-extraction-failed", payload);
            anyhow::bail!(message);
        }
        replace_extracted_directory(&context.paths)?;
        remove_file_if_present(&context.paths.partial);
        let _ = self
            .app_handle
            .emit("model-extraction-completed", &context.model.id);
        Ok(())
    }

    fn install_model_file(&self, context: &DownloadContext) -> Result<()> {
        let downloaded_size = context.paths.partial.metadata()?.len();
        if context.model.size_bytes > 0 && downloaded_size != context.model.size_bytes {
            remove_file_if_present(&context.paths.partial);
            anyhow::bail!(
                "Downloaded model {} has invalid size: expected {}, received {downloaded_size}",
                context.model.id,
                context.model.size_bytes
            );
        }
        let hash = context.model.sha256.as_deref();
        if !self.partial_matches_checksum(context, hash) {
            remove_file_if_present(&context.paths.partial);
            anyhow::bail!(
                "Downloaded model {} failed integrity verification",
                context.model.id
            );
        }
        fs::rename(&context.paths.partial, &context.paths.model)?;
        if let Some(hash) = hash {
            self.record_verification(&context.paths.model, hash);
        }
        Ok(())
    }
}

fn unpack_archive(context: &DownloadContext) -> Result<()> {
    let file = File::open(&context.paths.partial)?;
    if context.url.ends_with(".tar.bz2") || context.url.ends_with(".tbz2") {
        return Archive::new(BzDecoder::new(file))
            .unpack(&context.paths.extracting)
            .map_err(Into::into);
    }
    Archive::new(GzDecoder::new(file))
        .unpack(&context.paths.extracting)
        .map_err(Into::into)
}

fn replace_extracted_directory(paths: &DownloadPaths) -> Result<()> {
    let directories = fs::read_dir(&paths.extracting)?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .collect::<Vec<_>>();
    remove_directory_if_present(&paths.model)?;
    if directories.len() != 1 {
        fs::rename(&paths.extracting, &paths.model)?;
        return Ok(());
    }
    fs::rename(directories[0].path(), &paths.model)?;
    remove_directory_if_present(&paths.extracting)
}

fn remove_directory_if_present(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

pub(super) fn remove_file_if_present(path: &Path) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}
