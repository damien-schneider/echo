#[cfg(target_os = "linux")]
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
#[allow(dead_code)]
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

    // Anchor only to top edge — the compositor will center the window horizontally
    gtk_window.set_anchor(gtk_layer_shell::Edge::Top, true);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Bottom, false);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Left, false);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Right, false);
    debug!("[LayerShell] Set anchor to top edge only");

    info!("[LayerShell] Overlay window configured successfully (will realize on first show)");
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
pub fn init_layer_shell<R: Runtime>(_window: &WebviewWindow<R>) -> Result<(), String> {
    // No-op on other platforms
    Ok(())
}


/// Configure GNOME overlay fallback without presenting/showing.
/// Applies the focus policy so the overlay never steals focus from the user's app.
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

    let policy = gnome_overlay_focus_policy();

    info!("[Wayland] Configuring GNOME overlay fallback (keep_above, no focus)");
    gtk_window.set_keep_above(policy.keep_above);
    gtk_window.set_accept_focus(policy.accept_focus);
    gtk_window.set_focus_on_map(policy.focus_on_map);
    debug!("[Wayland] Set accept_focus={}, focus_on_map={}", policy.accept_focus, policy.focus_on_map);
}

/// Bring an overlay window to the front on GNOME Wayland using GTK-level APIs.
/// Uses `show()` instead of `present()` to avoid stealing keyboard focus.
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

    let policy = gnome_overlay_focus_policy();

    info!("[Wayland] Showing GNOME overlay (set_keep_above, no focus steal)");

    gtk_window.set_keep_above(policy.keep_above);
    gtk_window.set_accept_focus(policy.accept_focus);
    gtk_window.set_focus_on_map(policy.focus_on_map);

    // show() makes the window visible without stealing focus,
    // unlike present() which would grab keyboard focus
    gtk_window.show();
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
pub fn configure_gnome_overlay<R: Runtime>(_window: &WebviewWindow<R>) {
    // No-op
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
pub fn present_gnome_overlay<R: Runtime>(_window: &WebviewWindow<R>) {
    // No-op
}

/// Describes the focus policy for a GNOME overlay window.
/// Extracted so the configuration decisions can be tested on any platform.
#[derive(Debug, PartialEq)]
#[cfg(any(target_os = "linux", test))]
pub struct GnomeOverlayFocusPolicy {
    /// Whether the window should accept keyboard focus
    pub accept_focus: bool,
    /// Whether the window should grab focus when first mapped
    pub focus_on_map: bool,
    /// Whether to call `present()` (which steals focus) vs just `show()`
    pub use_present: bool,
    /// Whether to set keep_above (always on top)
    pub keep_above: bool,
}

/// Returns the focus policy for a GNOME overlay window.
/// The overlay must never steal focus from the user's active application.
#[cfg(any(target_os = "linux", test))]
pub fn gnome_overlay_focus_policy() -> GnomeOverlayFocusPolicy {
    GnomeOverlayFocusPolicy {
        accept_focus: false,
        focus_on_map: false,
        use_present: false,
        keep_above: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gnome_overlay_must_not_accept_focus() {
        let policy = gnome_overlay_focus_policy();
        assert!(
            !policy.accept_focus,
            "Overlay must not accept keyboard focus — it would steal focus from the user's app"
        );
    }

    #[test]
    fn gnome_overlay_must_not_focus_on_map() {
        let policy = gnome_overlay_focus_policy();
        assert!(
            !policy.focus_on_map,
            "Overlay must not grab focus when mapped — it would interrupt the user"
        );
    }

    #[test]
    fn gnome_overlay_must_not_use_present() {
        let policy = gnome_overlay_focus_policy();
        assert!(
            !policy.use_present,
            "present() steals focus on GNOME — use show()/set_visible instead"
        );
    }

    #[test]
    fn gnome_overlay_must_stay_on_top() {
        let policy = gnome_overlay_focus_policy();
        assert!(
            policy.keep_above,
            "Overlay must be kept above other windows"
        );
    }
}
