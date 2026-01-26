use crate::settings;
use crate::settings::OverlayPosition;
use enigo::{Enigo, Mouse};
use log::debug;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindowBuilder};

fn get_monitor_with_cursor(app_handle: &AppHandle) -> Option<tauri::Monitor> {
    // On Wayland, Enigo's cursor detection can hang or fail due to security restrictions.
    // Detect Wayland and skip directly to primary_monitor fallback.
    #[cfg(target_os = "linux")]
    {
        if let Ok(session_type) = std::env::var("XDG_SESSION_TYPE") {
            if session_type.to_lowercase() == "wayland" {
                debug!("[Overlay] Wayland detected, skipping Enigo cursor detection");
                return app_handle.primary_monitor().ok().flatten();
            }
        }
    }

    let enigo = Enigo::new(&Default::default());

    if let Ok(enigo) = enigo {
        if let Ok(mouse_location) = enigo.location() {
            if let Ok(monitors) = app_handle.available_monitors() {
                for monitor in monitors {
                    let is_within =
                        is_mouse_within_monitor(mouse_location, monitor.position(), monitor.size());
                    if is_within {
                        return Some(monitor);
                    }
                }
            }
        }
    }

    app_handle.primary_monitor().ok().flatten()
}

fn is_mouse_within_monitor(
    mouse_pos: (i32, i32),
    monitor_pos: &PhysicalPosition<i32>,
    monitor_size: &PhysicalSize<u32>,
) -> bool {
    let (mouse_x, mouse_y) = mouse_pos;
    let PhysicalPosition {
        x: monitor_x,
        y: monitor_y,
    } = *monitor_pos;
    let PhysicalSize {
        width: monitor_width,
        height: monitor_height,
    } = *monitor_size;

    mouse_x >= monitor_x
        && mouse_x < (monitor_x + monitor_width as i32)
        && mouse_y >= monitor_y
        && mouse_y < (monitor_y + monitor_height as i32)
}

/// Gets the full monitor dimensions for the monitor containing the cursor
fn get_full_screen_dimensions(app_handle: &AppHandle) -> Option<(f64, f64, f64, f64)> {
    if let Some(monitor) = get_monitor_with_cursor(app_handle) {
        let position = monitor.position();
        let size = monitor.size();
        let scale = monitor.scale_factor();

        let x = position.x as f64 / scale;
        let y = position.y as f64 / scale;
        let width = size.width as f64 / scale;
        let height = size.height as f64 / scale;

        return Some((x, y, width, height));
    }
    None
}

/// Creates the recording overlay window as a full-screen transparent window (hidden by default)
pub fn create_recording_overlay(app_handle: &AppHandle) {
    if let Some((x, y, width, height)) = get_full_screen_dimensions(app_handle) {
        match WebviewWindowBuilder::new(
            app_handle,
            "recording_overlay",
            tauri::WebviewUrl::App("src/overlay/index.html".into()),
        )
        .title("Recording")
        .position(x, y)
        .resizable(false)
        .inner_size(width, height)
        .shadow(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .accept_first_mouse(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .transparent(true)
        .focused(false)
        .visible(false)
        .build()
        {
            Ok(window) => {
                // Enable click-through on transparent areas
                let _ = window.set_ignore_cursor_events(true);
                debug!("Recording overlay window created successfully (hidden, full-screen)");
            }
            Err(e) => {
                debug!("Failed to create recording overlay window: {}", e);
            }
        }
    }
}

/// Shows the recording overlay window with fade-in animation
pub fn show_recording_overlay(app_handle: &AppHandle) {
    let app_handle = app_handle.clone();

    std::thread::spawn(move || {
        // Check if overlay should be shown based on position setting
        let settings = settings::get_settings(&app_handle);
        if settings.overlay_position == OverlayPosition::None {
            return;
        }

        update_overlay_position(&app_handle);

        if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
            let _ = overlay_window.show();
            // Emit position preference to frontend for CSS positioning
            let position = match settings.overlay_position {
                OverlayPosition::Top => "top",
                OverlayPosition::Bottom | OverlayPosition::None => "bottom",
            };
            let _ = overlay_window.emit("overlay-position", position);
            // Emit event to trigger fade-in animation with recording state
            let _ = overlay_window.emit("show-overlay", "recording");
        }
    });
}

/// Shows the transcribing overlay window
pub fn show_transcribing_overlay(app_handle: &AppHandle) {
    let app_handle = app_handle.clone();

    std::thread::spawn(move || {
        // Check if overlay should be shown based on position setting
        let settings = settings::get_settings(&app_handle);
        if settings.overlay_position == OverlayPosition::None {
            return;
        }

        update_overlay_position(&app_handle);

        if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
            let _ = overlay_window.show();
            // Emit position preference to frontend for CSS positioning
            let position = match settings.overlay_position {
                OverlayPosition::Top => "top",
                OverlayPosition::Bottom | OverlayPosition::None => "bottom",
            };
            let _ = overlay_window.emit("overlay-position", position);
            // Emit event to switch to transcribing state
            let _ = overlay_window.emit("show-overlay", "transcribing");
        }
    });
}

/// Shows a warning overlay with a custom message
pub fn show_warning_overlay(app_handle: &AppHandle, message: &str) {
    // Check if overlay should be shown based on position setting
    let settings = settings::get_settings(app_handle);
    if settings.overlay_position == OverlayPosition::None {
        return;
    }

    update_overlay_position(app_handle);

    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.show();
        // Emit position preference to frontend for CSS positioning
        let position = match settings.overlay_position {
            OverlayPosition::Top => "top",
            OverlayPosition::Bottom | OverlayPosition::None => "bottom",
        };
        let _ = overlay_window.emit("overlay-position", position);
        // Emit event to show warning state with message
        let _ = overlay_window.emit(
            "show-overlay",
            serde_json::json!({
                "state": "warning",
                "message": message
            }),
        );

        // Auto-hide after 2 seconds
        let window_clone = overlay_window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let _ = window_clone.emit("hide-overlay", ());
            std::thread::sleep(std::time::Duration::from_millis(300));
            let _ = window_clone.hide();
        });
    }
}

/// Updates the overlay window position and size for the current monitor (multi-monitor support)
pub fn update_overlay_position(app_handle: &AppHandle) {
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        if let Some((x, y, width, height)) = get_full_screen_dimensions(app_handle) {
            let _ = overlay_window
                .set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            let _ = overlay_window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                width,
                height,
            }));
        }
    }
}

/// Hides the recording overlay window with fade-out animation
pub fn hide_recording_overlay(app_handle: &AppHandle) {
    // Always hide the overlay regardless of settings - if setting was changed while recording,
    // we still want to hide it properly
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        // Emit event to trigger fade-out animation
        let _ = overlay_window.emit("hide-overlay", ());
        // Hide the window after a short delay to allow animation to complete
        let window_clone = overlay_window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            let _ = window_clone.hide();
        });
    }
}

pub fn emit_levels(app_handle: &AppHandle, levels: &Vec<f32>) {
    // emit levels to main app
    let _ = app_handle.emit("mic-level", levels);

    // also emit to the recording overlay if it's open
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.emit("mic-level", levels);
    }
}

pub fn emit_transcription_progress(app_handle: &AppHandle, text: &str) {
    // emit to main app
    let _ = app_handle.emit("transcription-progress", text);

    // also emit to the recording overlay if it's open
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.emit("transcription-progress", text);
    }
}
