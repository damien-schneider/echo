use std::sync::Arc;

use super::manager::PolishManager;
use super::runtime::IDLE_CHECK_INTERVAL;

pub(crate) fn watch_idle_runtime(manager: &Arc<PolishManager>) {
    let manager = manager.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(IDLE_CHECK_INTERVAL).await;
            manager.release_idle_runtime().await;
        }
    });
}
