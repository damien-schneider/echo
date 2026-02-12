use log::{debug, error, info, warn};
use tauri::{Runtime, WebviewWindow};

/// Check if running under a Wayland session.
/// Centralised helper used by clipboard, overlay, and shortcut modules.
#[cfg(target_os = "linux")]
pub fn is_wayland() -> bool {
    std::env::var("WAYLAND_DISPLAY").is_ok()
        || std::env::var("XDG_SESSION_TYPE")
            .map(|v| v.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
}

#[cfg(not(target_os = "linux"))]
pub fn is_wayland() -> bool {
    false
}

/// Initialize gtk-layer-shell for a Wayland overlay window.
/// This allows the window to appear above other windows and ignore input in transparent areas.
///
/// **Important**: `init_layer_shell()` must be called *before* the GTK window is realized.
/// Since Tauri realizes the window during `builder.build()`, we first unrealize it,
/// apply the layer-shell configuration, and let it be re-realized on the next `show()`.
#[cfg(target_os = "linux")]
pub fn init_layer_shell<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    use gtk::prelude::*;
    use gtk_layer_shell::LayerShell;

    info!("[LayerShell] Initializing gtk-layer-shell for overlay window");

    let gtk_window = match window.gtk_window() {
        Ok(w) => w,
        Err(e) => {
            error!("[LayerShell] Failed to get GTK window: {:?}", e);
            return Err(format!("Failed to get GTK window: {:?}", e));
        }
    };

    // Check if we're actually on Wayland
    if !gtk_layer_shell::is_supported() {
        warn!("[LayerShell] gtk-layer-shell is NOT supported on this display server");
        warn!("[LayerShell] Overlay will use fallback mode (may not appear above other windows)");
        return Err("gtk-layer-shell not supported (not running on Wayland or compositor doesn't support layer-shell)".to_string());
    }

    info!("[LayerShell] gtk-layer-shell is supported, initializing...");

    // --- Critical workaround ---
    // gtk-layer-shell requires init_layer_shell() to be called BEFORE the window
    // is realized. Tauri's builder.build() already realizes the window, so we
    // must unrealize it first, apply layer-shell, then let it re-realize on show().
    if gtk_window.is_realized() {
        debug!("[LayerShell] Window already realized, unrealizing before init...");
        gtk_window.unrealize();
    }

    // Initialize layer shell (now on an unrealized window — the correct state)
    gtk_window.init_layer_shell();
    info!("[LayerShell] Layer shell initialized");

    // Set the layer to Overlay (Always on top)
    gtk_window.set_layer(gtk_layer_shell::Layer::Overlay);
    debug!("[LayerShell] Set layer to Overlay");

    // Set keyboard interactivity to false (None)
    use gtk::glib::Cast;
    let window_base: &gtk::Window = gtk_window.upcast_ref();
    window_base.set_keyboard_interactivity(false);
    debug!("[LayerShell] Disabled keyboard interactivity");

    // Set exclusive zone to 0 (passthrough/don't move other windows)
    gtk_window.set_exclusive_zone(0);
    debug!("[LayerShell] Set exclusive zone to 0");

    // Anchor to all edges for full-screen overlay capability
    // The actual positioning is handled by the frontend CSS
    gtk_window.set_anchor(gtk_layer_shell::Edge::Top, true);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Bottom, true);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Left, true);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Right, true);
    debug!("[LayerShell] Set anchors to all edges");

    info!("[LayerShell] Overlay window configured successfully (will realize on first show)");
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn init_layer_shell<R: Runtime>(_window: &WebviewWindow<R>) -> Result<(), String> {
    // No-op on other platforms
    Ok(())
}


/// Configure GNOME overlay fallback (set_keep_above) without presenting/showing.
/// Should be called during window creation.
#[cfg(target_os = "linux")]
pub fn configure_gnome_overlay<R: Runtime>(window: &WebviewWindow<R>) {
    use gtk::prelude::*;

    let gtk_window = match window.gtk_window() {
        Ok(w) => w,
        Err(e) => {
            warn!("[Wayland] Could not get GTK window for configure: {:?}", e);
            return;
        }
    };

    // set_keep_above is a GTK3 API that Mutter respects more reliably
    // than Tauri's always_on_top abstraction on Wayland
    info!("[Wayland] Configuring GNOME overlay fallback (set_keep_above)");
    gtk_window.set_keep_above(true);
}

/// Bring an overlay window to the front on GNOME Wayland using GTK-level APIs.
/// Should be called every time the window is shown.
#[cfg(target_os = "linux")]
pub fn present_gnome_overlay<R: Runtime>(window: &WebviewWindow<R>) {
    use gtk::prelude::*;

    let gtk_window = match window.gtk_window() {
        Ok(w) => w,
        Err(e) => {
            warn!("[Wayland] Could not get GTK window for present: {:?}", e);
            return;
        }
    };

    info!("[Wayland] Presenting GNOME overlay (set_keep_above + present + set_visible)");

    // re-apply keep above just in case
    gtk_window.set_keep_above(true);

    // present() requests the compositor to bring this window to front
    gtk_window.present();

    // Explicitly ensure visibility via GTK
    gtk_window.set_visible(true);
}

#[cfg(not(target_os = "linux"))]
pub fn configure_gnome_overlay<R: Runtime>(_window: &WebviewWindow<R>) {
    // No-op
}

#[cfg(not(target_os = "linux"))]
pub fn present_gnome_overlay<R: Runtime>(_window: &WebviewWindow<R>) {
    // No-op
}
