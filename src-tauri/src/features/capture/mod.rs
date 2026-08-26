mod double_shift;
mod listener;
mod preview;
mod store;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::Utc;
use log::{error, warn};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::features::polish::manager::{PolishManager, SelectionRead};
use crate::managers::app_context::{FocusedAppProvider, PlatformFocusedAppProvider};
use crate::overlay::{show_tool_overlay, show_warning_overlay};
use crate::settings;

use preview::capture_preview;
pub(crate) use store::{Capture, CaptureStore};

const CAPTURES_UPDATED_EVENT: &str = "captures-updated";

pub(crate) struct CaptureShortcut {
    enabled: Arc<AtomicBool>,
    listening: AtomicBool,
}

impl CaptureShortcut {
    fn new() -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(false)),
            listening: AtomicBool::new(false),
        }
    }

    /// The global key listener cannot be torn down, so a disabled shortcut keeps it idle instead.
    pub(crate) fn set_enabled(&self, app: &AppHandle, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
        if enabled && !self.listening.swap(true, Ordering::SeqCst) {
            listener::listen_for_double_shift(app.clone(), self.enabled.clone());
        }
    }
}

pub(crate) fn start(app: &AppHandle) {
    let shortcut = Arc::new(CaptureShortcut::new());
    app.manage(shortcut.clone());

    let enabled = settings::get_settings(app).double_shift_capture_enabled;
    log::info!("[Capture] double-shift capture enabled: {enabled}");
    if enabled {
        shortcut.set_enabled(app, true);
    }
}

fn save_selection(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(text) = selected_text(&app).await {
            store_capture(&app, &text);
        }
    });
}

async fn selected_text(app: &AppHandle) -> Option<String> {
    log::info!("[Capture] reading the selection after a double Shift");
    let polish = Arc::clone(app.state::<Arc<PolishManager>>().inner());
    let generation = polish.begin_selection_read();
    let read = match polish.read_selection(generation).await {
        Ok(read) => read,
        Err(error) => {
            warn!("Double-shift capture could not read the selection: {error:#}");
            show_warning_overlay(app, "Could not read the selection");
            return None;
        }
    };

    let text = match read {
        SelectionRead::PermissionRequired => {
            show_warning_overlay(app, "Accessibility access is needed to read the selection");
            return None;
        }
        SelectionRead::Selected(text)
        | SelectionRead::Copied {
            text: Some(text), ..
        } => text,
        SelectionRead::Copied { text: None, .. } => String::new(),
    };

    if text.trim().is_empty() {
        show_warning_overlay(app, "No text selected");
        return None;
    }
    Some(text)
}

fn store_capture(app: &AppHandle, text: &str) {
    let focused_application = PlatformFocusedAppProvider
        .current()
        .and_then(|focused| focused.process_name.or(focused.bundle_id));

    match app.state::<Arc<CaptureStore>>().save(
        text,
        focused_application.as_deref(),
        Utc::now().timestamp(),
    ) {
        Ok(_) => {
            let _ = app.emit(CAPTURES_UPDATED_EVENT, ());
            show_tool_overlay(app, &format!("Saved: {}", capture_preview(text)));
        }
        Err(error) => {
            error!("Double-shift capture could not be saved: {error:#}");
            show_warning_overlay(app, "Could not save the capture");
        }
    }
}

#[tauri::command]
pub(crate) fn get_captures(store: State<'_, Arc<CaptureStore>>) -> Result<Vec<Capture>, String> {
    store.list().map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub(crate) fn delete_capture(
    app: AppHandle,
    store: State<'_, Arc<CaptureStore>>,
    id: i64,
) -> Result<(), String> {
    store.delete(id).map_err(|error| format!("{error:#}"))?;
    let _ = app.emit(CAPTURES_UPDATED_EVENT, ());
    Ok(())
}

#[tauri::command]
pub(crate) fn change_double_shift_capture_setting(
    app: AppHandle,
    shortcut: State<'_, Arc<CaptureShortcut>>,
    enabled: bool,
) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.double_shift_capture_enabled = enabled;
    settings::write_settings(&app, settings);
    shortcut.set_enabled(&app, enabled);
    Ok(())
}
