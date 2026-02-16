use crate::settings::{self, OverlayPosition};
#[cfg(not(target_os = "linux"))]
use enigo::{Enigo, Mouse};
use log::{debug, error, info, warn};
use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder};
#[cfg(not(target_os = "linux"))]
use tauri::{PhysicalPosition, PhysicalSize};

fn get_monitor_with_cursor(app_handle: &AppHandle) -> Option<tauri::Monitor> {
    // On Linux/Wayland, getting the monitor with cursor might fail or return
    // incorrect results. We prioritize:
    // 1. Mouse position monitor (if available) - not implemented here yet
    // 2. Primary monitor
    // 3. Any available monitor (fallback)

    #[cfg(target_os = "linux")]
    {
        // Try standard primary monitor first
        if let Ok(Some(monitor)) = app_handle.primary_monitor() {
            return Some(monitor);
        }

        // Fallback: take first available monitor
        if let Ok(monitors) = app_handle.available_monitors() {
            if let Some(first) = monitors.first() {
                warn!("[Overlay] Primary monitor detection failed, using first available monitor: {:?}", first.name());
                return Some(first.clone());
            }
        }

        error!("[Overlay] CRITICAL: No monitors detected!");
        return None;
    }

    #[cfg(not(target_os = "linux"))]
    {
        let enigo = Enigo::new(&Default::default());

        if let Ok(enigo) = enigo {
            if let Ok(mouse_location) = enigo.location() {
                if let Ok(monitors) = app_handle.available_monitors() {
                    for monitor in monitors {
                        let is_within = is_mouse_within_monitor(
                            mouse_location,
                            monitor.position(),
                            monitor.size(),
                        );
                        if is_within {
                            return Some(monitor);
                        }
                    }
                }
            }
        }

        app_handle.primary_monitor().ok().flatten()
    }
}

#[cfg(not(target_os = "linux"))]
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
    #[cfg(target_os = "linux")]
    let is_wayland_session = crate::wayland::is_wayland();
    #[cfg(not(target_os = "linux"))]
    let is_wayland_session = false;

    if is_wayland_session {
        info!("[Overlay] Creating overlay for Wayland session");
    }

    if let Some((x, y, width, height)) = get_full_screen_dimensions(app_handle) {
        info!(
            "[Overlay] Creating overlay window at ({}, {}) with size {}x{}",
            x, y, width, height
        );

        let builder = WebviewWindowBuilder::new(
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
        .visible(false);

        // On Wayland, some window hints may behave differently
        // The overlay should still work but may have compositor-specific behavior
        #[cfg(target_os = "linux")]
        if is_wayland_session {
            // Wayland compositors handle always_on_top differently
            // GNOME/Mutter and KDE/KWin both support it but may require
            // the window to be "above" type
            debug!("[Overlay] Wayland: always_on_top behavior depends on compositor");
        }

        match builder.build() {
            Ok(window) => {
                // Initialize Layer Shell on Wayland for proper overlay behavior
                #[cfg(target_os = "linux")]
                if is_wayland_session {
                    match crate::wayland::init_layer_shell(&window) {
                        Ok(()) => {
                            info!("[Overlay] Successfully initialized gtk-layer-shell for Wayland");
                        }
                        Err(e) => {
                            warn!("[Overlay] gtk-layer-shell initialization failed: {}", e);
                            // GNOME fallback: use GTK set_keep_above since Mutter
                            // doesn't support wlr-layer-shell.
                            // Use configure only (don't present yet) to avoid showing empty window at startup.
                            info!("[Overlay] Applying GNOME/Mutter fallback configuration");
                            crate::wayland::configure_gnome_overlay(&window);
                        }
                    }
                }

                // NOTE: Do NOT call set_ignore_cursor_events here.
                // On Wayland, the GdkWindow doesn't exist yet for a hidden window,
                // and tao panics at event_loop.rs:449 (unwrap on None from gtk_widget_get_window).
                // We defer it to show_recording_overlay() when the window is realized.

                info!("[Overlay] Recording overlay window created successfully");
            }
            Err(e) => {
                warn!("[Overlay] Failed to create recording overlay window: {}", e);
            }
        }
    } else {
        warn!("[Overlay] Could not determine screen dimensions for overlay");
    }
}

/// Shows the recording overlay window with fade-in animation.
/// Uses `run_on_main_thread` so that GTK/layer-shell operations happen on the
/// correct thread (required on Wayland).
pub fn show_recording_overlay(app_handle: &AppHandle) {
    let app_handle = app_handle.clone();
    let app_handle_inner = app_handle.clone();

    let _ = app_handle.run_on_main_thread(move || {
        let app_handle = app_handle_inner;
        // Check if overlay should be shown based on position setting
        let settings = settings::get_settings(&app_handle);
        if settings.overlay_position == OverlayPosition::None {
            return;
        }

        update_overlay_position(&app_handle);

        if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
            debug!("[Overlay] Showing recording overlay");
            if let Err(e) = overlay_window.show() {
                error!("[Overlay] Failed to show overlay window: {}", e);
                return;
            }
            // Enable click-through now that the window is realized (GdkWindow exists)
            if let Err(e) = overlay_window.set_ignore_cursor_events(true) {
                warn!("[Overlay] Failed to set ignore_cursor_events: {}", e);
            }
            // On Wayland, we handle positioning via layer shell anchors
            #[cfg(target_os = "linux")]
            {
                if crate::wayland::is_wayland() {
                    use gtk_layer_shell::LayerShell;
                    match overlay_window.gtk_window() {
                        Ok(gtk_window) => {
                            if gtk_layer_shell::is_supported() {
                                let is_top =
                                    matches!(settings.overlay_position, OverlayPosition::Top);
                                gtk_window.set_anchor(gtk_layer_shell::Edge::Top, is_top);
                                gtk_window.set_anchor(gtk_layer_shell::Edge::Bottom, !is_top);
                                gtk_window.set_anchor(gtk_layer_shell::Edge::Left, true);
                                gtk_window.set_anchor(gtk_layer_shell::Edge::Right, true);
                                debug!(
                                    "[Overlay] Updated layer-shell anchors for position: {:?}",
                                    settings.overlay_position
                                );
                            }
                        }
                        Err(e) => {
                            warn!(
                                "[Overlay] Could not get GTK window for anchor update: {:?}",
                                e
                            );
                        }
                    }
                    // On GNOME Wayland, bring window to front via GTK APIs
                    crate::wayland::present_gnome_overlay(&overlay_window);
                }
            }
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

/// Shows the transcribing overlay window.
/// Uses `run_on_main_thread` so that GTK/layer-shell operations happen on the
/// correct thread (required on Wayland).
pub fn show_transcribing_overlay(app_handle: &AppHandle) {
    let app_handle = app_handle.clone();
    let app_handle_inner = app_handle.clone();

    let _ = app_handle.run_on_main_thread(move || {
        let app_handle = app_handle_inner;
        // Check if overlay should be shown based on position setting
        let settings = settings::get_settings(&app_handle);
        if settings.overlay_position == OverlayPosition::None {
            return;
        }

        update_overlay_position(&app_handle);

        if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
            let _ = overlay_window.show();
            // On Wayland, bring window to front via GTK APIs
            #[cfg(target_os = "linux")]
            if crate::wayland::is_wayland() {
                crate::wayland::present_gnome_overlay(&overlay_window);
            }
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
        // On Wayland, bring window to front via GTK APIs
        #[cfg(target_os = "linux")]
        if crate::wayland::is_wayland() {
            crate::wayland::present_gnome_overlay(&overlay_window);
        }
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
            let _ =
                overlay_window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
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
