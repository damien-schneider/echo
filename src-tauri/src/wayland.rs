#[cfg(target_os = "linux")]
use log::{debug, error, info, warn};
use tauri::{Runtime, WebviewWindow};

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

#[cfg(target_os = "linux")]
pub fn init_layer_shell<R: Runtime>(
    window: &WebviewWindow<R>,
    anchors: (bool, bool, bool, bool),
) -> Result<(), String> {
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

    if !gtk_layer_shell::is_supported() {
        warn!("[LayerShell] gtk-layer-shell is NOT supported on this display server");
        warn!("[LayerShell] Overlay will use fallback mode (may not appear above other windows)");
        return Err("gtk-layer-shell not supported (not running on Wayland or compositor doesn't support layer-shell)".to_string());
    }

    info!("[LayerShell] gtk-layer-shell is supported, initializing...");

    // gtk-layer-shell needs init before GTK realize — Tauri `build()` already realized it
    if gtk_window.is_realized() {
        debug!("[LayerShell] Window already realized, unrealizing before init...");
        gtk_window.unrealize();
    }

    gtk_window.init_layer_shell();
    info!("[LayerShell] Layer shell initialized");

    gtk_window.set_layer(gtk_layer_shell::Layer::Overlay);
    debug!("[LayerShell] Set layer to Overlay");

    use gtk::glib::Cast;
    let window_base: &gtk::Window = gtk_window.upcast_ref();
    window_base.set_keyboard_interactivity(false);
    debug!("[LayerShell] Disabled keyboard interactivity");

    // zone 0 — reserves no space, never reflows other windows
    gtk_window.set_exclusive_zone(0);
    debug!("[LayerShell] Set exclusive zone to 0");

    let (anchor_top, anchor_bottom, anchor_left, anchor_right) = anchors;
    gtk_window.set_anchor(gtk_layer_shell::Edge::Top, anchor_top);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Bottom, anchor_bottom);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Left, anchor_left);
    gtk_window.set_anchor(gtk_layer_shell::Edge::Right, anchor_right);
    debug!("[LayerShell] Anchored overlay to {anchors:?}");

    info!("[LayerShell] Overlay window configured successfully (will realize on first show)");
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
pub fn init_layer_shell<R: Runtime>(
    _window: &WebviewWindow<R>,
    _anchors: (bool, bool, bool, bool),
) -> Result<(), String> {
    Ok(())
}

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
    debug!(
        "[Wayland] Set accept_focus={}, focus_on_map={}",
        policy.accept_focus, policy.focus_on_map
    );
}

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

    // show() not present() — present() steals keyboard focus on GNOME
    gtk_window.show();
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
pub fn configure_gnome_overlay<R: Runtime>(_window: &WebviewWindow<R>) {}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
pub fn present_gnome_overlay<R: Runtime>(_window: &WebviewWindow<R>) {}

#[derive(Debug, PartialEq)]
#[cfg(any(target_os = "linux", test))]
pub struct GnomeOverlayFocusPolicy {
    pub accept_focus: bool,
    pub focus_on_map: bool,
    /// `present()` steals focus on GNOME; `show()` does not
    pub use_present: bool,
    pub keep_above: bool,
}

/// Overlay must never steal focus from user's active app.
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
