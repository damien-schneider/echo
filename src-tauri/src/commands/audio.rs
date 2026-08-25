use crate::audio_feedback;
use crate::audio_toolkit::audio::{list_input_devices, list_output_devices};
use crate::managers::audio::{AudioRecordingManager, MicrophoneMode};
use crate::settings;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct CustomSounds {
    start: bool,
    stop: bool,
}

fn custom_sound_exists(app: &AppHandle, sound_type: &str) -> bool {
    app.path()
        .resolve(
            format!("custom_{}.wav", sound_type),
            tauri::path::BaseDirectory::AppData,
        )
        .map_or(false, |path| path.exists())
}

#[tauri::command]
pub fn check_custom_sounds(app: AppHandle) -> CustomSounds {
    CustomSounds {
        start: custom_sound_exists(&app, "start"),
        stop: custom_sound_exists(&app, "stop"),
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AudioDevice {
    pub index: String,
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn update_microphone_mode(app: AppHandle, always_on: bool) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.always_on_microphone = always_on;
    });

    let rm = app.state::<Arc<AudioRecordingManager>>();
    let new_mode = if always_on {
        MicrophoneMode::AlwaysOn
    } else {
        MicrophoneMode::OnDemand
    };

    rm.update_mode(new_mode)
        .map_err(|e| format!("Failed to update microphone mode: {}", e))
}

#[tauri::command]
pub fn get_microphone_mode(app: AppHandle) -> Result<bool, String> {
    let s = settings::get_settings(&app);
    Ok(s.always_on_microphone)
}

#[tauri::command]
pub fn get_available_microphones() -> Result<Vec<AudioDevice>, String> {
    let devices =
        list_input_devices().map_err(|e| format!("Failed to list audio devices: {}", e))?;

    let mut result = vec![AudioDevice {
        index: "default".to_string(),
        name: "Default".to_string(),
        is_default: true,
    }];

    result.extend(devices.into_iter().map(|d| AudioDevice {
        index: d.index,
        name: d.name,
        is_default: false, // The explicit default is handled separately
    }));

    Ok(result)
}

#[tauri::command]
pub fn set_selected_microphone(app: AppHandle, device_name: String) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.selected_microphone = if device_name == "default" {
            None
        } else {
            Some(device_name.clone())
        };
    });

    let rm = app.state::<Arc<AudioRecordingManager>>();
    rm.update_selected_device()
        .map_err(|e| format!("Failed to update selected device: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn set_clamshell_microphone(app: AppHandle, device_name: String) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.clamshell_microphone = if device_name == "default" {
            None
        } else {
            Some(device_name.clone())
        };
    });

    // restart so the recorder picks up the new device
    let rm = app.state::<Arc<AudioRecordingManager>>();
    rm.update_selected_device()
        .map_err(|e| format!("Failed to update clamshell device: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_selected_microphone(app: AppHandle) -> Result<String, String> {
    let s = settings::get_settings(&app);
    Ok(s.selected_microphone
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
pub fn get_clamshell_microphone(app: AppHandle) -> Result<String, String> {
    let s = settings::get_settings(&app);
    Ok(s.clamshell_microphone
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
pub fn get_available_output_devices() -> Result<Vec<AudioDevice>, String> {
    let devices =
        list_output_devices().map_err(|e| format!("Failed to list output devices: {}", e))?;

    let mut result = vec![AudioDevice {
        index: "default".to_string(),
        name: "Default".to_string(),
        is_default: true,
    }];

    result.extend(devices.into_iter().map(|d| AudioDevice {
        index: d.index,
        name: d.name,
        is_default: false, // The explicit default is handled separately
    }));

    Ok(result)
}

#[tauri::command]
pub fn set_selected_output_device(app: AppHandle, device_name: String) -> Result<(), String> {
    settings::update_settings(&app, |s| {
        s.selected_output_device = if device_name == "default" {
            None
        } else {
            Some(device_name.clone())
        };
    });
    Ok(())
}

#[tauri::command]
pub fn get_selected_output_device(app: AppHandle) -> Result<String, String> {
    let s = settings::get_settings(&app);
    Ok(s.selected_output_device
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
pub fn play_test_sound(app: AppHandle, sound_type: String) {
    let sound = match sound_type.as_str() {
        "start" => audio_feedback::SoundType::Start,
        "stop" => audio_feedback::SoundType::Stop,
        _ => {
            log::warn!("Unknown sound type: {}", sound_type);
            return;
        }
    };
    audio_feedback::play_test_sound(&app, sound);
}

/// macOS mic TCC state: only `not_determined` can still show a system prompt.
#[cfg(target_os = "macos")]
pub(crate) fn microphone_permission_status() -> &'static str {
    use objc2::msg_send;
    use objc2_foundation::NSString;
    unsafe {
        let cls = objc2::class!(AVCaptureDevice);
        let av_media_type = NSString::from_str("soun");
        let status: i32 =
            unsafe { msg_send![cls, authorizationStatusForMediaType: &*av_media_type] };
        match status {
            3 => "authorized",
            2 => "denied",
            _ => "not_determined",
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn microphone_permission_status() -> &'static str {
    "authorized"
}

#[tauri::command]
pub fn get_microphone_permission_status() -> &'static str {
    microphone_permission_status()
}

#[tauri::command]
pub fn open_microphone_settings(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
            None::<String>,
        )
        .map_err(|e| format!("Failed to open Microphone settings: {e}"))
}
