//! Right-clicking the HUD reaches what the tray reaches, without aiming for the menu bar.

use super::events;
use super::window::RECORDING_OVERLAY_LABEL;
use crate::managers::meeting::{MeetingManager, MeetingStatus};
use crate::startup::show_main_window;
use log::warn;
use std::sync::Arc;
use tauri::menu::{ContextMenu, IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Emitter, Manager};

const OPEN_ECHO: &str = "overlay_open_echo";
const TOGGLE_MEETING: &str = "overlay_toggle_meeting";
const INSPECT: &str = "overlay_inspect";

/// Sync commands run on the main thread, where `popup` would deadlock waiting for the event loop
/// it is blocking: the menu's own modal loop needs that thread free.
#[tauri::command(async)]
pub(crate) fn show_overlay_menu(app_handle: AppHandle) -> Result<(), String> {
    let overlay = app_handle
        .get_webview_window(RECORDING_OVERLAY_LABEL)
        .ok_or("The overlay window is gone")?;
    build_menu(&app_handle)
        .map_err(|error| format!("Failed to build the overlay menu: {error}"))?
        .popup(overlay.as_ref().window())
        .map_err(|error| format!("Failed to open the overlay menu: {error}"))
}

/// Menu ids are global — the tray handler sees these too, so the overlay claims its own ids here
/// and leaves the shared ones to it.
pub(crate) fn handle_menu_event(app_handle: &AppHandle, id: &str) -> bool {
    match id {
        OPEN_ECHO => show_main_window(app_handle),
        TOGGLE_MEETING => toggle_meeting(app_handle),
        #[cfg(debug_assertions)]
        INSPECT => open_overlay_devtools(app_handle),
        _ => return false,
    }
    true
}

fn build_menu(app_handle: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let (meeting_label, meeting_enabled) = meeting_action(app_handle);
    let open_echo = MenuItem::with_id(app_handle, OPEN_ECHO, "Open Echo", true, None::<&str>)?;
    let meeting = MenuItem::with_id(
        app_handle,
        TOGGLE_MEETING,
        meeting_label,
        meeting_enabled,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app_handle)?;
    let settings = MenuItem::with_id(app_handle, "settings", "Settings…", true, None::<&str>)?;
    let inspect = inspect_item(app_handle)?;
    let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> =
        vec![&open_echo, &meeting, &separator, &settings];
    if let Some(inspect) = &inspect {
        items.push(inspect);
    }
    Menu::with_items(app_handle, &items)
}

/// A HUD that swallows the right-click would swallow the only way into its own devtools.
fn inspect_item(app_handle: &AppHandle) -> tauri::Result<Option<MenuItem<tauri::Wry>>> {
    if !cfg!(debug_assertions) {
        return Ok(None);
    }
    MenuItem::with_id(app_handle, INSPECT, "Inspect Element", true, None::<&str>).map(Some)
}

fn meeting_action(app_handle: &AppHandle) -> (&'static str, bool) {
    match app_handle
        .try_state::<Arc<MeetingManager>>()
        .map(|manager| manager.get_meeting_status())
    {
        Some(MeetingStatus::Recording) => ("Stop Meeting Recording", true),
        Some(MeetingStatus::Processing) => ("Transcribing Meeting…", false),
        Some(_) => ("Start Meeting Recording", true),
        None => ("Start Meeting Recording", false),
    }
}

fn toggle_meeting(app_handle: &AppHandle) {
    let Some(manager) = app_handle.try_state::<Arc<MeetingManager>>() else {
        warn!("[Overlay] Meeting recording is unavailable");
        return;
    };
    let manager = manager.inner().clone();
    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = if matches!(manager.get_meeting_status(), MeetingStatus::Recording) {
            manager.clone().stop_meeting().await.map(|()| false)
        } else {
            manager.start_meeting(None).await.map(|_| true)
        };
        match outcome {
            // A meeting recording behind a closed window is a meeting nobody trusts is running.
            Ok(true) => open_meeting_page(&app_handle),
            Ok(false) => {}
            Err(error) => events::show_warning_overlay(&app_handle, &error.to_string()),
        }
    });
}

fn open_meeting_page(app_handle: &AppHandle) {
    show_main_window(app_handle);
    if let Err(error) = app_handle.emit_to("main", "open-settings-section", "meeting") {
        warn!("[Overlay] Failed to open the meeting page: {error}");
    }
}

#[cfg(debug_assertions)]
fn open_overlay_devtools(app_handle: &AppHandle) {
    if let Some(overlay) = app_handle.get_webview_window(RECORDING_OVERLAY_LABEL) {
        overlay.open_devtools();
    }
}
