use crate::features::polish::manager::PolishManager;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub(crate) fn shutdown(app: &AppHandle) {
    let manager = app.state::<Arc<PolishManager>>();
    if let Err(error) = tauri::async_runtime::block_on(manager.shutdown()) {
        log::error!("Failed to stop local Polish runtime during exit: {error:#}");
    }
}
