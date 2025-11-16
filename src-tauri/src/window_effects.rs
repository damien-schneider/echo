use tauri::WebviewWindow;

/// Apply the platform-specific appearance tweaks (vibrancy/liquid glass) to the
/// provided window. Currently only macOS supports these effects.
pub fn apply_window_effects(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        apply_macos_window_effects(window);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
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
