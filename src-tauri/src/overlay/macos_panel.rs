use super::layout::{overlay_mode_accepts_keyboard, OverlaySurfaceKind, RecordingOverlayMode};
use super::macos_hover::{
    hud_panel_can_become_key_window, panel_hover_state_for_label, PanelHoverState, HOVER_PANELS,
    PASTE_KEY_SUPPRESSED,
};
use super::macos_hover_sync::{register_panel_window, sync_hover_key_possession};
use super::surface::OverlayBoxPayload;
use std::{sync::atomic::Ordering, sync::mpsc, time::Duration};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_nspanel::objc2_foundation::MainThreadMarker as AppKitMainThreadMarker;
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt};

const PANEL_OPERATION_TIMEOUT: Duration = Duration::from_secs(2);

type OverlayPanelHandle = tauri_nspanel::PanelHandle<tauri::Wry>;

#[derive(Clone, Copy)]
enum PanelOperation {
    Hide,
    ReleaseKey,
    SetLayout(RecordingOverlayMode, OverlayBoxPayload),
    Show,
}

tauri_nspanel::tauri_panel!(EchoOverlayPanel {
    config: {
        can_become_key_window: hud_panel_can_become_key_window(),
        can_become_main_window: false,
        becomes_key_only_if_needed: true,
        hides_on_deactivate: false,
        is_floating_panel: true,
        works_when_modal: true,
    }
});

mod notification_panel {
    use super::{apply_shared_panel_configuration, require_main_thread, OverlayPanelHandle};
    use tauri::{Manager, WebviewWindow};
    use tauri_nspanel::WebviewWindowExt;

    tauri_nspanel::tauri_panel!(EchoNotificationPanel {
        config: {
            can_become_key_window: super::super::macos_hover::notification_panel_can_become_key_window(),
            can_become_main_window: false,
            becomes_key_only_if_needed: true,
            hides_on_deactivate: false,
            is_floating_panel: true,
            works_when_modal: true,
        }
    });

    pub(super) fn configure(window: &WebviewWindow) -> Result<OverlayPanelHandle, String> {
        require_main_thread()?;
        let panel = window
            .to_panel::<EchoNotificationPanel>()
            .map_err(|error| format!("Failed to create the notification panel: {error}"))?;
        apply_shared_panel_configuration(&panel);
        Ok(panel)
    }
}

mod snap_preview_panel {
    use super::{overlay_collection_behavior, require_main_thread};
    use tauri::{Manager, WebviewWindow};
    use tauri_nspanel::{PanelLevel, StyleMask, WebviewWindowExt};

    tauri_nspanel::tauri_panel!(EchoSnapPreviewPanel {
        config: {
            can_become_key_window: false,
            can_become_main_window: false,
            becomes_key_only_if_needed: false,
            hides_on_deactivate: false,
            is_floating_panel: true,
            works_when_modal: true,
        }
    });

    pub(super) fn configure(window: &WebviewWindow) -> Result<(), String> {
        require_main_thread()?;
        let panel = window
            .to_panel::<EchoSnapPreviewPanel>()
            .map_err(|error| format!("Failed to create snap preview panel: {error}"))?;
        panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
        panel.set_collection_behavior(overlay_collection_behavior().into());
        panel.set_level(PanelLevel::ModalPanel.value());
        panel.set_hides_on_deactivate(false);
        panel.set_released_when_closed(false);
        panel.set_ignores_mouse_events(true);
        Ok(())
    }
}

fn apply_shared_panel_configuration(panel: &OverlayPanelHandle) {
    panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
    panel.set_collection_behavior(overlay_collection_behavior().into());
    panel.set_level(PanelLevel::Status.value());
    panel.set_hides_on_deactivate(false);
    panel.set_becomes_key_only_if_needed(true);
    panel.set_works_when_modal(true);
    panel.set_released_when_closed(false);
    panel.set_accepts_mouse_moved_events(true);
}

pub(super) fn configure(
    window: &WebviewWindow,
    initially_visible: bool,
    mode: RecordingOverlayMode,
) -> Result<(), String> {
    require_main_thread()?;
    panel_hover_state_for_label(window.label())?.set_key_policy(mode);
    let panel = window
        .to_panel::<EchoOverlayPanel>()
        .map_err(|error| format!("Failed to create non-activating overlay panel: {error}"))?;
    apply_shared_panel_configuration(&panel);
    register_panel_window(OverlaySurfaceKind::Hud, window)?;
    if initially_visible {
        panel.show();
    }
    Ok(())
}

/// The notification never opens on its own — activity or a HUD action asks Rust to show it.
pub(super) fn configure_notification(window: &WebviewWindow) -> Result<(), String> {
    notification_panel::configure(window)?;
    register_panel_window(OverlaySurfaceKind::Notification, window)
}

pub(super) fn configure_snap_preview(window: &WebviewWindow) -> Result<(), String> {
    snap_preview_panel::configure(window)
}

/// A panel holding key for hover would swallow paste keystrokes; chat mode is exempt, it owns key deliberately.
pub(super) fn begin_paste_key_suppression(app_handle: &AppHandle) {
    PASTE_KEY_SUPPRESSED.store(true, Ordering::Release);
    for panel in HOVER_PANELS {
        if panel.accepts_key() {
            continue;
        }
        let _ = run_panel_operation(app_handle, panel.label(), PanelOperation::ReleaseKey);
    }
}

pub(super) fn end_paste_key_suppression() {
    PASTE_KEY_SUPPRESSED.store(false, Ordering::Release);
}

pub(super) fn set_layout(
    app_handle: &AppHandle,
    label: &'static str,
    mode: RecordingOverlayMode,
    hover: OverlayBoxPayload,
) -> Result<(), String> {
    run_panel_operation(app_handle, label, PanelOperation::SetLayout(mode, hover))
}

pub(super) fn show(app_handle: &AppHandle, label: &'static str) -> Result<(), String> {
    run_panel_operation(app_handle, label, PanelOperation::Show)
}

pub(super) fn hide(app_handle: &AppHandle, label: &'static str) -> Result<(), String> {
    run_panel_operation(app_handle, label, PanelOperation::Hide)
}

pub(super) fn release_key(app_handle: &AppHandle, label: &'static str) -> Result<(), String> {
    run_panel_operation(app_handle, label, PanelOperation::ReleaseKey)
}

fn run_panel_operation(
    app_handle: &AppHandle,
    label: &'static str,
    operation: PanelOperation,
) -> Result<(), String> {
    if AppKitMainThreadMarker::new().is_some() {
        return perform_panel_operation(app_handle, label, operation);
    }
    let (sender, receiver) = mpsc::sync_channel(1);
    let main_app_handle = app_handle.clone();
    app_handle
        .run_on_main_thread(move || {
            let _ = sender.send(perform_panel_operation(&main_app_handle, label, operation));
        })
        .map_err(|error| format!("Failed to schedule overlay panel update: {error}"))?;
    receiver
        .recv_timeout(PANEL_OPERATION_TIMEOUT)
        .map_err(|error| format!("Overlay panel update timed out: {error}"))?
}

fn perform_panel_operation(
    app_handle: &AppHandle,
    label: &'static str,
    operation: PanelOperation,
) -> Result<(), String> {
    require_main_thread()?;
    let state = panel_hover_state_for_label(label)?;
    let panel = panel(app_handle, label)?;
    match operation {
        PanelOperation::Hide => {
            panel.resign_key_window();
            panel.set_ignores_mouse_events(true);
            state.pointer_left(app_handle);
            panel.hide();
        }
        PanelOperation::ReleaseKey => panel.resign_key_window(),
        PanelOperation::SetLayout(mode, hover) => {
            state.replace_hover_box(hover);
            apply_layout(&panel, state, mode);
            sync_hover_key_possession(app_handle);
        }
        PanelOperation::Show => panel.show(),
    }
    Ok(())
}

fn apply_layout(panel: &OverlayPanelHandle, state: &PanelHoverState, mode: RecordingOverlayMode) {
    let accepts_keyboard = overlay_mode_accepts_keyboard(mode);
    state.set_key_policy(mode);
    if accepts_keyboard {
        panel.set_level(PanelLevel::ModalPanel.value());
        panel.set_ignores_mouse_events(false);
        panel.make_key_window();
        return;
    }
    panel.set_level(PanelLevel::Status.value());
}

fn require_main_thread() -> Result<(), String> {
    AppKitMainThreadMarker::new()
        .map(|_| ())
        .ok_or_else(|| "Overlay panel operation must run on the main thread".to_string())
}

fn overlay_collection_behavior() -> CollectionBehavior {
    CollectionBehavior::new()
        .can_join_all_spaces()
        .full_screen_auxiliary()
}

fn panel(app_handle: &AppHandle, label: &str) -> Result<OverlayPanelHandle, String> {
    app_handle
        .get_webview_panel(label)
        .map_err(|_| format!("Overlay panel {label} is unavailable"))
}

#[cfg(test)]
#[path = "macos_panel_tests.rs"]
mod tests;
