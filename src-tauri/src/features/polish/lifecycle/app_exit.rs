use crate::features::polish::manager::PolishManager;
use std::sync::Arc;
use tauri::{AppHandle, Manager, RunEvent};

pub(crate) fn handle(app: &AppHandle, event: &RunEvent) {
    if !event_requires_polish_shutdown(event) {
        return;
    }
    let manager = app.state::<Arc<PolishManager>>();
    if let Err(error) = tauri::async_runtime::block_on(manager.shutdown()) {
        log::error!("Failed to stop local Polish runtime during exit: {error:#}");
    }
}

fn event_requires_polish_shutdown(event: &RunEvent) -> bool {
    matches!(event, RunEvent::Exit)
}

#[cfg(test)]
mod tests {
    use tauri::RunEvent;

    #[test]
    fn only_final_exit_requests_polish_shutdown() {
        assert!(super::event_requires_polish_shutdown(&RunEvent::Exit));
        assert!(!super::event_requires_polish_shutdown(&RunEvent::Ready));
    }
}
