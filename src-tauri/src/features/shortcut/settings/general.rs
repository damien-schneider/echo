use log::warn;
use tauri::{AppHandle, Emitter};
use tauri_plugin_autostart::ManagerExt;

use crate::settings::{self, ClipboardHandling, OverlayPosition, PasteMethod};

#[tauri::command]
pub fn change_translate_to_english_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.translate_to_english = enabled;
    });
    Ok(())
}

#[tauri::command]
pub fn change_selected_language_setting(app: AppHandle, language: String) -> Result<(), String> {
    crate::managers::transcription::whisper_language(&language)
        .map_err(|error| error.to_string())?;
    settings::update_settings(&app, |s| {
        s.selected_language = language.clone();
    });
    Ok(())
}

#[tauri::command]
pub fn change_overlay_position_setting(app: AppHandle, position: String) -> Result<(), String> {
    let parsed = match position.as_str() {
        "none" => OverlayPosition::None,
        "edge" => OverlayPosition::Edge,
        "top" => OverlayPosition::Top,
        "bottom" => OverlayPosition::Bottom,
        other => {
            warn!("Invalid overlay position '{}', defaulting to edge", other);
            OverlayPosition::Edge
        }
    };
    settings::update_settings(&app, |s| {
        s.overlay_position = parsed;
    });

    // outside the lock — moves the overlay without recreating the window
    crate::utils::update_overlay_position(&app);

    Ok(())
}

#[tauri::command]
pub fn change_debug_mode_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.debug_mode = enabled;
    });

    let _ = app.emit(
        "settings-changed",
        serde_json::json!({
            "setting": "debug_mode",
            "value": enabled
        }),
    );

    Ok(())
}

#[tauri::command]
pub fn change_start_hidden_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.start_hidden = enabled;
    });

    let _ = app.emit(
        "settings-changed",
        serde_json::json!({
            "setting": "start_hidden",
            "value": enabled
        }),
    );

    Ok(())
}

#[tauri::command]
pub fn change_autostart_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.autostart_enabled = enabled;
    });

    let autostart_manager = app.autolaunch();
    if enabled {
        let _ = autostart_manager.enable();
    } else {
        let _ = autostart_manager.disable();
    }

    let _ = app.emit(
        "settings-changed",
        serde_json::json!({
            "setting": "autostart_enabled",
            "value": enabled
        }),
    );

    Ok(())
}

#[tauri::command]
pub fn update_custom_words(app: AppHandle, words: Vec<String>) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.custom_words = words.clone();
    });
    Ok(())
}

#[tauri::command]
pub fn change_word_correction_threshold_setting(
    app: AppHandle,
    threshold: f64,
) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.word_correction_threshold = threshold;
    });
    Ok(())
}

#[tauri::command]
pub fn change_paste_method_setting(app: AppHandle, method: String) -> Result<(), String> {
    let parsed = match method.as_str() {
        "ctrl_v" => PasteMethod::CtrlV,
        #[cfg(target_os = "linux")]
        "direct" => PasteMethod::Direct,
        #[cfg(not(target_os = "macos"))]
        "shift_insert" => PasteMethod::ShiftInsert,
        "clipboard_only" => PasteMethod::ClipboardOnly,
        other => {
            warn!("Invalid paste method '{}', defaulting to ctrl_v", other);
            PasteMethod::CtrlV
        }
    };
    settings::update_settings(&app, |s| {
        s.paste_method = parsed;
    });
    Ok(())
}

#[tauri::command]
pub fn change_clipboard_handling_setting(app: AppHandle, handling: String) -> Result<(), String> {
    let parsed = match handling.as_str() {
        "dont_modify" => ClipboardHandling::DontModify,
        "copy_to_clipboard" => ClipboardHandling::CopyToClipboard,
        other => {
            warn!(
                "Invalid clipboard handling '{}', defaulting to dont_modify",
                other
            );
            ClipboardHandling::DontModify
        }
    };
    settings::update_settings(&app, |s| {
        s.clipboard_handling = parsed;
    });
    Ok(())
}

#[tauri::command]
pub fn change_debug_logging_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.debug_logging_enabled = enabled;
    });
    crate::logging::set_debug_logging(enabled);
    Ok(())
}
