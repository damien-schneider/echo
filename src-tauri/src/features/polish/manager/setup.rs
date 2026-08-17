use anyhow::{Context, Result};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::managers::model::{ModelManager, POLISH_MODEL_ID};

use super::super::runtime::PolishRuntimeConfig;
use super::super::selection::SelectionMode;
use super::super::{polish_status_for_availability, PolishState, PolishStatus};

pub(super) struct PolishInitialization {
    pub(super) config: PolishRuntimeConfig,
    pub(super) error: Option<String>,
    pub(super) status: PolishStatus,
}

pub(super) fn polish_initialization(
    config: Result<PolishRuntimeConfig>,
    is_downloaded: bool,
) -> PolishInitialization {
    match config {
        Ok(config) => PolishInitialization {
            config,
            error: None,
            status: polish_status_for_availability(is_downloaded),
        },
        Err(error) => {
            log::error!("Polish setup is unavailable: {error:#}");
            PolishInitialization {
                config: PolishRuntimeConfig {
                    server_path: PathBuf::new(),
                    working_directory: PathBuf::new(),
                    model_path: PathBuf::new(),
                },
                error: Some(error.to_string()),
                status: PolishStatus {
                    state: PolishState::Repair,
                    message: "Polish setup is unavailable. Reinstall Echo to repair it."
                        .to_string(),
                },
            }
        }
    }
}

pub(super) fn polish_runtime_config(
    app: &AppHandle,
    models: &ModelManager,
) -> Result<PolishRuntimeConfig> {
    let runtime_directory = polish_runtime_directory(app)?;
    Ok(PolishRuntimeConfig {
        server_path: runtime_directory.join(polish_server_filename()),
        working_directory: runtime_directory,
        model_path: models.model_file_path(POLISH_MODEL_ID)?,
    })
}

fn polish_runtime_directory(app: &AppHandle) -> Result<PathBuf> {
    let bundled = app
        .path()
        .resolve(
            "resources/polish-runtime",
            tauri::path::BaseDirectory::Resource,
        )
        .context("Failed to resolve Polish runtime directory")?;
    Ok(select_runtime_directory(
        bundled,
        development_runtime_directory(),
    ))
}

fn select_runtime_directory(bundled: PathBuf, development: Option<PathBuf>) -> PathBuf {
    development
        .filter(|directory| directory.join(polish_server_filename()).is_file())
        .unwrap_or(bundled)
}

#[cfg(debug_assertions)]
fn development_runtime_directory() -> Option<PathBuf> {
    Some(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("polish-runtime"),
    )
}

#[cfg(not(debug_assertions))]
fn development_runtime_directory() -> Option<PathBuf> {
    None
}

#[cfg(target_os = "windows")]
fn polish_server_filename() -> &'static str {
    "llama-server.exe"
}

#[cfg(not(target_os = "windows"))]
fn polish_server_filename() -> &'static str {
    "llama-server"
}

pub(super) fn selection_mode() -> SelectionMode {
    #[cfg(target_os = "linux")]
    if crate::wayland::is_wayland() {
        return SelectionMode::ClipboardOnly;
    }
    SelectionMode::ReplaceSelection
}

#[cfg(test)]
mod tests {
    #[test]
    fn initialization_failure_disables_polish_without_panicking() {
        let initialization = super::polish_initialization(
            Err(anyhow::anyhow!("resource directory unavailable")),
            true,
        );

        assert!(initialization.error.is_some());
        assert!(initialization.status.state == super::PolishState::Repair);
        assert!(initialization.config.server_path.as_os_str().is_empty());
    }

    #[test]
    fn development_runtime_bypasses_copied_build_resources() {
        let directory = tempfile::tempdir().unwrap();
        let development = directory.path().join("source");
        std::fs::create_dir(&development).unwrap();
        std::fs::write(development.join(super::polish_server_filename()), []).unwrap();
        let bundled = directory.path().join("copied");

        assert_eq!(
            super::select_runtime_directory(bundled, Some(development.clone())),
            development
        );
    }

    #[test]
    fn packaged_runtime_remains_the_fallback() {
        let bundled = std::path::PathBuf::from("/bundle/polish-runtime");

        assert_eq!(
            super::select_runtime_directory(
                bundled.clone(),
                Some(std::path::PathBuf::from("/missing/polish-runtime"))
            ),
            bundled
        );
    }
}
