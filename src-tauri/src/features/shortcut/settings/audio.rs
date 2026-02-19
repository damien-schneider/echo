//! Audio-related settings commands.

use log::warn;
use tauri::AppHandle;

use crate::settings::{self, SoundTheme};

/// Change push-to-talk setting.
#[tauri::command]
pub fn change_ptt_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    // TODO if the setting is currently false, we probably want to
    // cancel any ongoing recordings or actions
    settings::update_settings(&app, |s| {
        s.push_to_talk = enabled;
    });

    Ok(())
}

/// Change audio feedback enabled setting.
#[tauri::command]
pub fn change_audio_feedback_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.audio_feedback = enabled;
    });
    Ok(())
}

/// Change audio feedback volume setting.
#[tauri::command]
pub fn change_audio_feedback_volume_setting(app: AppHandle, volume: f32) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.audio_feedback_volume = volume;
    });
    Ok(())
}

/// Change sound theme setting.
#[tauri::command]
pub fn change_sound_theme_setting(app: AppHandle, theme: String) -> Result<(), String> {
    let parsed = match theme.as_str() {
        "marimba" => SoundTheme::Marimba,
        "pop" => SoundTheme::Pop,
        "custom" => SoundTheme::Custom,
        other => {
            warn!("Invalid sound theme '{}', defaulting to marimba", other);
            SoundTheme::Marimba
        }
    };
    settings::update_settings(&app, |s| {
        s.sound_theme = parsed;
    });
    Ok(())
}

/// Change mute while recording setting.
#[tauri::command]
pub fn change_mute_while_recording_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.mute_while_recording = enabled;
    });

    Ok(())
}
