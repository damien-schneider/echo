//! Downloads earlier Echo versions left in the shared models folder that no catalog entry reads.
use super::model::ModelManager;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const LEGACY_MODEL_NAMES: &[&str] = &[
    "ggml-tiny.bin",
    "ggml-base.bin",
    "ggml-small.bin",
    "whisper-medium-q4_1.bin",
    "ggml-large-v3-turbo.bin",
    "parakeet-tdt-0.6b-v2-int8",
    "parakeet-tdt-0.6b-v3-int8",
    "sherpa-onnx-pyannote-segmentation-3-0",
    "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",
    "cleanup",
];
const DOWNLOAD_SUFFIXES: &[&str] = &["", ".partial", ".extracting"];

impl ModelManager {
    pub fn legacy_model_files(&self) -> Vec<PathBuf> {
        legacy_model_paths(&self.models_dir)
    }

    /// `None` when older versions left nothing that takes space.
    pub fn legacy_model_files_mb(&self) -> Option<u64> {
        let bytes: u64 = self
            .legacy_model_files()
            .iter()
            .map(|path| disk_usage_bytes(path))
            .sum();
        (bytes > 0).then(|| bytes.div_ceil(1_000_000))
    }

    pub fn delete_legacy_model_files(&self) -> io::Result<()> {
        remove_paths(&self.legacy_model_files())
    }
}

fn legacy_model_paths(models_dir: &Path) -> Vec<PathBuf> {
    LEGACY_MODEL_NAMES
        .iter()
        .flat_map(|name| {
            DOWNLOAD_SUFFIXES
                .iter()
                .map(move |suffix| models_dir.join(format!("{name}{suffix}")))
        })
        .filter(|path| path.symlink_metadata().is_ok())
        .collect()
}

fn disk_usage_bytes(path: &Path) -> u64 {
    let Ok(metadata) = path.symlink_metadata() else {
        return 0;
    };
    if !metadata.is_dir() {
        return metadata.len();
    }
    fs::read_dir(path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| disk_usage_bytes(&entry.path()))
                .sum()
        })
        .unwrap_or(0)
}

fn remove_paths(paths: &[PathBuf]) -> io::Result<()> {
    for path in paths {
        if path.symlink_metadata()?.is_dir() {
            fs::remove_dir_all(path)?;
        } else {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sweep_finds_old_downloads_and_spares_current_models() {
        let models_dir = tempfile::tempdir().unwrap();
        let dir = models_dir.path();
        fs::write(dir.join("ggml-tiny.bin"), [0; 10]).unwrap();
        fs::write(dir.join("ggml-large-v3-turbo.bin.partial"), [0; 5]).unwrap();
        fs::create_dir_all(dir.join("parakeet-tdt-0.6b-v3-int8/nested")).unwrap();
        fs::write(
            dir.join("parakeet-tdt-0.6b-v3-int8/nested/model.onnx"),
            [0; 7],
        )
        .unwrap();
        fs::write(dir.join("ggml-small-q5_1.bin"), [0; 3]).unwrap();
        fs::write(dir.join("ggml-large-v3-turbo-q5_0.bin.partial"), [0; 4]).unwrap();

        let legacy = legacy_model_paths(dir);
        let total: u64 = legacy.iter().map(|path| disk_usage_bytes(path)).sum();
        remove_paths(&legacy).unwrap();

        assert_eq!(legacy.len(), 3);
        assert_eq!(total, 22);
        assert!(legacy_model_paths(dir).is_empty());
        assert!(dir.join("ggml-small-q5_1.bin").exists());
        assert!(dir.join("ggml-large-v3-turbo-q5_0.bin.partial").exists());
    }
}
