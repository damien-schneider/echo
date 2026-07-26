use super::progress::ProgressCadence;
use crate::managers::model::{DownloadProgress, ModelManager};
use anyhow::Result;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::Emitter;

const HASH_BUFFER_SIZE: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub(super) enum ModelVerificationEvent {
    Started { model_id: String },
    Progress(DownloadProgress),
}

#[derive(Clone, Copy)]
pub(super) struct VerificationTarget<'a> {
    pub(super) expected_sha256: &'a str,
    pub(super) model_id: &'a str,
    pub(super) path: &'a Path,
}

#[derive(Clone, Copy)]
struct VerificationPosition {
    is_terminal: bool,
    total: u64,
    verified: u64,
}

#[derive(Clone, Copy)]
struct HashOperation<'a> {
    model_id: &'a str,
    total: u64,
}

impl ModelManager {
    pub(super) fn verify_model_file(&self, target: VerificationTarget<'_>) -> Result<()> {
        verify_file_sha256_with_progress(target, |event| {
            self.emit_verification_event(event);
        })
    }

    fn emit_verification_event(&self, event: ModelVerificationEvent) {
        match event {
            ModelVerificationEvent::Started { model_id } => {
                let _ = self.app_handle.emit("model-verification-started", model_id);
            }
            ModelVerificationEvent::Progress(progress) => {
                let _ = self
                    .app_handle
                    .emit("model-verification-progress", progress);
            }
        }
    }
}

#[cfg(test)]
pub(crate) fn verify_file_sha256(path: &Path, expected_sha256: &str) -> Result<()> {
    verify_file_sha256_with_progress(
        VerificationTarget {
            expected_sha256,
            model_id: "",
            path,
        },
        |_| {},
    )
}

pub(super) fn verify_file_sha256_with_progress(
    target: VerificationTarget<'_>,
    mut emit: impl FnMut(ModelVerificationEvent),
) -> Result<()> {
    let mut file = File::open(target.path)?;
    emit(ModelVerificationEvent::Started {
        model_id: target.model_id.to_string(),
    });
    let operation = HashOperation {
        model_id: target.model_id,
        total: file.metadata()?.len(),
    };
    let actual = hash_file(&mut file, operation, &mut emit)?;
    validate_checksum(&actual, target.expected_sha256)
}

fn hash_file(
    file: &mut File,
    operation: HashOperation<'_>,
    emit: &mut impl FnMut(ModelVerificationEvent),
) -> Result<String> {
    let started = Instant::now();
    let mut cadence = ProgressCadence::default();
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; HASH_BUFFER_SIZE];
    let mut verified = 0;
    if cadence.should_emit(Duration::ZERO, false) {
        emit(ModelVerificationEvent::Progress(verification_progress(
            operation.model_id,
            VerificationPosition {
                is_terminal: false,
                total: operation.total,
                verified,
            },
        )));
    }
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        verified += read as u64;
        if verified < operation.total && cadence.should_emit(started.elapsed(), false) {
            emit(ModelVerificationEvent::Progress(verification_progress(
                operation.model_id,
                VerificationPosition {
                    is_terminal: false,
                    total: operation.total,
                    verified,
                },
            )));
        }
    }
    if cadence.should_emit(started.elapsed(), true) {
        emit(ModelVerificationEvent::Progress(verification_progress(
            operation.model_id,
            VerificationPosition {
                is_terminal: true,
                total: operation.total,
                verified,
            },
        )));
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verification_progress(model_id: &str, position: VerificationPosition) -> DownloadProgress {
    let percentage = if position.is_terminal {
        100.0
    } else if position.total == 0 {
        0.0
    } else {
        (position.verified as f64 / position.total as f64 * 100.0).clamp(0.0, 100.0)
    };
    DownloadProgress {
        model_id: model_id.to_string(),
        downloaded: position.verified,
        total: position.total,
        percentage,
    }
}

fn validate_checksum(actual: &str, expected: &str) -> Result<()> {
    if actual == expected {
        return Ok(());
    }
    Err(anyhow::anyhow!(
        "Model checksum mismatch: expected {expected}, got {actual}"
    ))
}
