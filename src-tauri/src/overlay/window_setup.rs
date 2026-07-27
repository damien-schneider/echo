use super::layout::{
    overlay_initially_visible, OverlayFrame, OverlayPlacement, RecordingOverlayMode,
};
#[cfg(target_os = "macos")]
use super::macos_panel;
use super::monitor::overlay_screen;
use super::snap::{build_snap_preview, refresh_snap_preview};
use super::surface::overlay_surface;
use super::window::{surface_request, OVERLAY_NOTIFICATION_LABEL, RECORDING_OVERLAY_LABEL};
use super::window_modes::update_overlay_position;
use crate::settings::{self, OverlayPosition};
use log::{debug, info, warn};
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

pub(crate) fn create_recording_overlay(app_handle: &AppHandle) {
    #[cfg(target_os = "linux")]
    let is_wayland_session = crate::wayland::is_wayland();
    #[cfg(not(target_os = "linux"))]
    let is_wayland_session = false;

    if is_wayland_session {
        info!("[Overlay] Creating overlay for Wayland session");
    }

    let settings = settings::get_settings(app_handle);
    let placement = OverlayPlacement::from_settings(&settings);
    let Some(screen) = overlay_screen(app_handle) else {
        warn!("[Overlay] Could not determine screen dimensions for overlay");
        return;
    };
    let frame = overlay_surface(surface_request(
        screen,
        placement,
        RecordingOverlayMode::Compact,
    ))
    .window;

    info!(
        "[Overlay] Creating overlay window at ({}, {}) with size {}x{}",
        frame.x, frame.y, frame.width, frame.height
    );

    match build_recording_overlay(app_handle, frame, settings.overlay_position) {
        Ok(window) => {
            observe_recording_overlay_moves(&window);
            configure_created_window(window, placement, is_wayland_session);
            if let Err(error) = build_snap_preview(app_handle) {
                warn!("[Overlay] Failed to create snap preview window: {error}");
            }
        }
        Err(error) => warn!("[Overlay] Failed to create recording overlay window: {error}"),
    }
    create_overlay_notification(app_handle, screen, placement);
}

/// Own window so activity can open at the notch while the HUD stays put.
fn create_overlay_notification(
    app_handle: &AppHandle,
    screen: super::monitor::OverlayScreen,
    placement: OverlayPlacement,
) {
    let frame = overlay_surface(surface_request(
        screen,
        placement,
        RecordingOverlayMode::Recording,
    ))
    .window;
    match build_overlay_notification(app_handle, frame) {
        Ok(window) => {
            if let Err(error) = configure_notification_window(&window) {
                warn!("[Overlay] Notification surface disabled for this session: {error}");
                let _ = window.destroy();
                return;
            }
            info!("[Overlay] Notification window created successfully");
        }
        Err(error) => warn!("[Overlay] Failed to create the notification window: {error}"),
    }
}

fn build_overlay_notification(
    app_handle: &AppHandle,
    frame: OverlayFrame,
) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(
        app_handle,
        OVERLAY_NOTIFICATION_LABEL,
        tauri::WebviewUrl::App("src/overlay/notification.html".into()),
    )
    .title("Echo Notification")
    .position(frame.x, frame.y)
    .resizable(false)
    .inner_size(frame.width, frame.height)
    .shadow(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .accept_first_mouse(true)
    .decorations(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .transparent(true)
    .focusable(initial_overlay_focusable())
    .focused(false)
    .visible(false)
    .build()
}

fn configure_notification_window(window: &WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        window
            .set_ignore_cursor_events(true)
            .map_err(|error| format!("Failed to disable notification cursor events: {error}"))?;
        macos_panel::configure_notification(window)?;
    }
    #[cfg(not(target_os = "macos"))]
    window
        .set_ignore_cursor_events(false)
        .map_err(|error| format!("Failed to enable notification cursor events: {error}"))?;
    Ok(())
}

fn build_recording_overlay(
    app_handle: &AppHandle,
    frame: OverlayFrame,
    _position: OverlayPosition,
) -> tauri::Result<WebviewWindow> {
    let builder = WebviewWindowBuilder::new(
        app_handle,
        RECORDING_OVERLAY_LABEL,
        tauri::WebviewUrl::App("src/overlay/index.html".into()),
    )
    .title("Recording")
    .position(frame.x, frame.y)
    .resizable(false)
    .inner_size(frame.width, frame.height)
    .shadow(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .accept_first_mouse(true)
    .decorations(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .transparent(true)
    .focusable(initial_overlay_focusable())
    .focused(false)
    .visible(false);
    #[cfg(not(target_os = "macos"))]
    let builder = builder.visible(overlay_initially_visible(_position));
    builder.build()
}

fn observe_recording_overlay_moves(window: &WebviewWindow) {
    let app_handle = window.app_handle().clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Moved(_)) {
            if let Err(error) = refresh_snap_preview(&app_handle) {
                debug!("[Overlay] Failed to refresh snap preview: {error}");
            }
        }
    });
}

#[cfg(target_os = "macos")]
fn initial_overlay_focusable() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
fn initial_overlay_focusable() -> bool {
    false
}

fn configure_created_window(
    window: WebviewWindow,
    placement: OverlayPlacement,
    is_wayland_session: bool,
) {
    #[cfg(target_os = "linux")]
    if is_wayland_session {
        let anchors = super::layout::wayland_anchor_edges(placement);
        match crate::wayland::init_layer_shell(&window, anchors) {
            Ok(()) => info!("[Overlay] Successfully initialized gtk-layer-shell for Wayland"),
            Err(error) => {
                warn!("[Overlay] gtk-layer-shell initialization failed: {error}");
                info!("[Overlay] Applying GNOME/Mutter fallback configuration");
                crate::wayland::configure_gnome_overlay(&window);
            }
        }
    }

    #[cfg(not(target_os = "linux"))]
    let _ = (placement, is_wayland_session);

    let native_setup = configure_or_destroy_overlay(
        || configure_macos_window(&window, placement),
        || {
            window
                .destroy()
                .map_err(|error| format!("Failed to destroy unusable overlay: {error}"))
        },
    );
    if let Err(error) = native_setup {
        warn!("[Overlay] Native HUD disabled for this session: {error}");
        return;
    }
    #[cfg(not(target_os = "macos"))]
    if let Err(error) = window.set_ignore_cursor_events(false) {
        warn!("[Overlay] Failed to set ignore_cursor_events: {error}");
    }
    update_overlay_position(window.app_handle());
    info!("[Overlay] Recording overlay window created successfully");
}

fn configure_or_destroy_overlay(
    configure: impl FnOnce() -> Result<(), String>,
    destroy: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let Err(configuration_error) = configure() else {
        return Ok(());
    };
    match destroy() {
        Ok(()) => Err(configuration_error),
        Err(cleanup_error) => Err(format!(
            "{configuration_error}; cleanup also failed: {cleanup_error}"
        )),
    }
}

fn configure_macos_window(
    window: &WebviewWindow,
    placement: OverlayPlacement,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        window
            .set_ignore_cursor_events(true)
            .map_err(|error| format!("Failed to disable overlay cursor events: {error}"))?;
        macos_panel::configure(
            window,
            overlay_initially_visible(placement.position),
            RecordingOverlayMode::Compact,
        )?;
        debug!("[Overlay] Configured non-activating NSPanel");
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (window, placement);
    Ok(())
}

#[cfg(test)]
#[path = "window_setup_tests.rs"]
mod tests;
