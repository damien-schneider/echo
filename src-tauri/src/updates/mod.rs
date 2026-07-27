mod service;
mod status;

use std::sync::Arc;
use tauri::AppHandle;

pub(crate) use service::UpdateManager;
use service::{check, install, snapshot, CheckTrigger};
use status::UpdateSnapshot;

/// A dev build runs from src-tauri/target — installing a bundle over it would wreck the tree.
const UPDATER_ENABLED: bool = !cfg!(debug_assertions);

pub(crate) fn manager() -> Arc<UpdateManager> {
    Arc::new(UpdateManager::default())
}

pub(crate) fn watch(app: &AppHandle) {
    if UPDATER_ENABLED {
        service::watch(app);
    }
}

/// Tray-initiated check — no window is listening for the answer.
pub(crate) fn check_in_background(app: &AppHandle) {
    if !UPDATER_ENABLED {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        check(&app, CheckTrigger::Manual).await;
    });
}

#[tauri::command]
pub(crate) fn get_update_status(app: AppHandle) -> UpdateSnapshot {
    if UPDATER_ENABLED {
        snapshot(&app)
    } else {
        UpdateSnapshot::unsupported()
    }
}

/// Resolves after the check so the caller can tell "up to date" from "never checked".
#[tauri::command]
pub(crate) async fn check_for_updates(app: AppHandle) -> UpdateSnapshot {
    if !UPDATER_ENABLED {
        return UpdateSnapshot::unsupported();
    }
    check(&app, CheckTrigger::Manual).await
}

#[tauri::command]
pub(crate) async fn install_update(app: AppHandle) -> Result<(), String> {
    if !UPDATER_ENABLED {
        return Err("This dev build has no updater.".to_string());
    }
    install(&app).await
}
