use tauri::WebviewWindow;

/// Apply the platform-specific appearance tweaks (vibrancy/liquid glass/blur) to the
/// provided window.
pub fn apply_window_effects(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        apply_macos_window_effects(window);
    }

    #[cfg(target_os = "linux")]
    {
        apply_linux_window_effects(window);
    }

    #[cfg(target_os = "windows")]
    {
        apply_windows_window_effects(window);
    }
}

#[cfg(target_os = "macos")]
fn apply_macos_window_effects(window: &WebviewWindow) {
    if let Err(liquid_error) = apply_liquid_glass_effect(window) {
        log::warn!(
            "Liquid glass unsupported, falling back to vibrancy: {:?}",
            liquid_error
        );

        if let Err(vibrancy_error) = apply_vibrancy_effect(window) {
            log::warn!(
                "Failed to apply legacy vibrancy fallback: {:?}",
                vibrancy_error
            );
        }
    }
}

#[cfg(target_os = "macos")]
fn apply_liquid_glass_effect(window: &WebviewWindow) -> Result<(), window_vibrancy::Error> {
    use window_vibrancy::{apply_liquid_glass, NSGlassEffectViewStyle};

    apply_liquid_glass(window, NSGlassEffectViewStyle::Clear, None, Some(26.0))
}

#[cfg(target_os = "macos")]
fn apply_vibrancy_effect(window: &WebviewWindow) -> Result<(), window_vibrancy::Error> {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

    apply_vibrancy(
        window,
        NSVisualEffectMaterial::UnderWindowBackground,
        None,
        None,
    )
}

#[cfg(target_os = "linux")]
fn apply_linux_window_effects(window: &WebviewWindow) {
    // On Linux, transparency is handled through the compositor.
    // We attempt to clear any existing blur to get a pure transparent window.
    // The CSS backdrop-filter in the frontend will handle the glassmorphism effect.

    // Note: For true compositor blur on Linux, users need:
    // - Wayland: A compositor that supports blur (e.g., KWin, Hyprland, Sway with blur patches)
    // - X11: A compositor like picom with blur enabled

    // The window is already set to transparent in tauri.conf.json
    // We just log that we're relying on CSS for the glass effect
    log::info!("Linux window: Using CSS backdrop-filter for glassmorphism effect");
    log::info!("For compositor blur, ensure your compositor supports blur effects");

    // The window parameter is intentionally unused on Linux
    // as transparency is handled by CSS and the compositor
    let _ = window;
}

#[cfg(target_os = "windows")]
fn apply_windows_window_effects(window: &WebviewWindow) {
    use window_vibrancy::apply_mica;

    // Try Mica effect first (Windows 11)
    if let Err(e) = apply_mica(window, None) {
        log::warn!("Mica effect not available (requires Windows 11): {:?}", e);

        // Fallback to acrylic for Windows 10
        use window_vibrancy::apply_acrylic;
        if let Err(e) = apply_acrylic(window, Some((0, 0, 0, 100))) {
            log::warn!("Acrylic effect also failed: {:?}", e);
        }
    }
}
