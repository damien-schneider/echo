use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Proof that an installed artifact already passed its checksum. Re-hashing a
/// 2.5 GB model on every launch costs more than the download it protects.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct VerificationReceipt {
    sha256: String,
    size: u64,
    modified_ms: u128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ArtifactFingerprint {
    modified_ms: u128,
    size: u64,
}

pub(super) fn receipt_path(model_path: &Path) -> PathBuf {
    let name = model_path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    model_path.with_file_name(format!("{name}.verified"))
}

pub(super) fn artifact_is_verified(model_path: &Path, expected_sha256: &str) -> bool {
    let Some(receipt) = read_receipt(model_path) else {
        return false;
    };
    let Ok(fingerprint) = artifact_fingerprint(model_path) else {
        return false;
    };
    receipt.sha256 == expected_sha256
        && receipt.size == fingerprint.size
        && receipt.modified_ms == fingerprint.modified_ms
}

pub(super) fn write_receipt(model_path: &Path, expected_sha256: &str) -> Result<()> {
    let fingerprint = artifact_fingerprint(model_path)?;
    let receipt = VerificationReceipt {
        sha256: expected_sha256.to_string(),
        size: fingerprint.size,
        modified_ms: fingerprint.modified_ms,
    };
    fs::write(receipt_path(model_path), serde_json::to_string(&receipt)?)?;
    Ok(())
}

pub(in crate::managers) fn remove_receipt(model_path: &Path) {
    let _ = fs::remove_file(receipt_path(model_path));
}

fn read_receipt(model_path: &Path) -> Option<VerificationReceipt> {
    let raw = fs::read_to_string(receipt_path(model_path)).ok()?;
    serde_json::from_str(&raw).ok()
}

fn artifact_fingerprint(path: &Path) -> Result<ArtifactFingerprint> {
    let metadata = path.metadata()?;
    Ok(ArtifactFingerprint {
        modified_ms: metadata.modified()?.duration_since(UNIX_EPOCH)?.as_millis(),
        size: metadata.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    #[test]
    fn receipt_sits_next_to_the_artifact_it_describes() {
        assert_eq!(
            receipt_path(Path::new("/models/model.gguf")),
            Path::new("/models/model.gguf.verified")
        );
    }

    #[test]
    fn verified_artifact_is_not_hashed_a_second_time() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("model.gguf");
        std::fs::write(&path, b"abc").unwrap();

        assert!(!artifact_is_verified(&path, SHA256));
        write_receipt(&path, SHA256).unwrap();
        assert!(artifact_is_verified(&path, SHA256));
    }

    #[test]
    fn receipt_from_another_artifact_revision_is_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("model.gguf");
        std::fs::write(&path, b"abc").unwrap();
        write_receipt(&path, SHA256).unwrap();

        assert!(!artifact_is_verified(&path, &"0".repeat(64)));
    }

    #[test]
    fn rewritten_artifact_invalidates_its_receipt() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("model.gguf");
        std::fs::write(&path, b"abc").unwrap();
        write_receipt(&path, SHA256).unwrap();

        std::fs::write(&path, b"abcd").unwrap();

        assert!(!artifact_is_verified(&path, SHA256));
    }

    #[test]
    fn deleted_artifact_takes_its_receipt_with_it() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("model.gguf");
        std::fs::write(&path, b"abc").unwrap();
        write_receipt(&path, SHA256).unwrap();

        remove_receipt(&path);

        assert!(!receipt_path(&path).exists());
        assert!(!artifact_is_verified(&path, SHA256));
    }

    #[test]
    fn corrupt_receipt_falls_back_to_a_full_checksum() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("model.gguf");
        std::fs::write(&path, b"abc").unwrap();
        std::fs::write(receipt_path(&path), b"not json").unwrap();

        assert!(!artifact_is_verified(&path, SHA256));
    }
}
