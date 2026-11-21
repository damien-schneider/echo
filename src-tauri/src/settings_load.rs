use super::*;
use log::error;
use tauri::path::BaseDirectory;
use tauri::Manager;

pub(super) const SETTINGS_KEY: &str = "settings";
pub(super) const UNREADABLE_SETTINGS_BACKUP_KEY: &str = "settings_unreadable_backup";
const UNREADABLE_SETTINGS_BACKUP_FILE: &str = "settings_unreadable_backup.json";

/// The parse error of a store file the plugin would load as empty and overwrite on its next save.
pub(super) fn unreadable_store_file(contents: &[u8]) -> Option<serde_json::Error> {
    if contents.iter().all(u8::is_ascii_whitespace) {
        return None;
    }
    serde_json::from_slice::<serde_json::Map<String, serde_json::Value>>(contents).err()
}

/// Must run before the store is built: the plugin swallows its load error.
pub(super) fn keep_unreadable_store_file(app: &AppHandle) {
    let Ok(path) = app
        .path()
        .resolve(SETTINGS_STORE_PATH, BaseDirectory::AppData)
    else {
        return;
    };
    let Ok(contents) = std::fs::read(&path) else {
        return;
    };
    let Some(cause) = unreadable_store_file(&contents) else {
        return;
    };
    let backup = path.with_file_name(UNREADABLE_SETTINGS_BACKUP_FILE);
    match std::fs::rename(&path, &backup) {
        Ok(()) => error!(
            "Settings file does not parse ({cause}); kept as '{}', defaults are used",
            backup.display()
        ),
        Err(error) => error!(
            "Settings file does not parse ({cause}) and could not be kept as '{}': {error}",
            backup.display()
        ),
    }
}

pub(super) struct SettingsLoad {
    pub(super) settings: AppSettings,
    pub(super) store_writes: Vec<(&'static str, serde_json::Value)>,
}

fn retire_removed_sound_themes(raw: &mut serde_json::Value) -> bool {
    match raw.get_mut("sound_theme") {
        Some(theme) if theme == "pop" => {
            *theme = serde_json::json!("marimba");
            true
        }
        _ => false,
    }
}

fn retire_overlay_bars(raw: &mut serde_json::Value) -> bool {
    let Some(fields) = raw.as_object_mut() else {
        return false;
    };
    let edge = match fields
        .get("overlay_position")
        .and_then(serde_json::Value::as_str)
    {
        Some(bar @ ("top" | "bottom")) => bar.to_string(),
        _ => return false,
    };
    fields.insert("overlay_position".to_string(), serde_json::json!("edge"));
    fields.insert("overlay_dock_edge".to_string(), serde_json::json!(edge));
    fields.insert("overlay_dock_offset".to_string(), serde_json::json!(0.5));
    true
}

fn retire_removed_values(raw: &mut serde_json::Value) -> bool {
    retire_removed_sound_themes(raw) | retire_overlay_bars(raw)
}

pub(super) fn load_stored_settings(
    mut raw: serde_json::Value,
) -> serde_json::Result<(AppSettings, bool)> {
    let retired = retire_removed_values(&mut raw);
    let mut settings = AppSettings::deserialize(&raw)?;
    let updated = apply_settings_migrations_from_raw(&mut settings, Some(&raw));
    Ok((settings, retired || updated))
}

/// Probes each stored field alone against default settings; legacy keys stay for the migrations.
fn reset_unreadable_fields(
    stored: &mut serde_json::Value,
    probe: &mut serde_json::Value,
) -> Vec<String> {
    let Some(fields) = stored.as_object_mut() else {
        return Vec::new();
    };
    let mut reset = Vec::new();
    for (name, value) in fields.iter_mut() {
        let Some(slot) = probe.get_mut(name.as_str()) else {
            continue;
        };
        let default = std::mem::replace(slot, value.clone());
        if AppSettings::deserialize(&*probe).is_err() {
            *value = default.clone();
            reset.push(name.clone());
        }
        probe[name.as_str()] = default;
    }
    reset
}

fn fill_missing_fields(stored: &mut serde_json::Value, defaults: serde_json::Value) {
    let (Some(fields), serde_json::Value::Object(defaults)) = (stored.as_object_mut(), defaults)
    else {
        return;
    };
    for (name, default) in defaults {
        fields.entry(name).or_insert(default);
    }
}

fn recover_readable_fields(raw: &serde_json::Value) -> AppSettings {
    let Some(mut defaults) = serialize_settings(&get_default_settings()) else {
        return get_default_settings();
    };
    let mut readable = if raw.is_object() {
        raw.clone()
    } else {
        serde_json::json!({})
    };
    retire_removed_values(&mut readable);
    let reset = reset_unreadable_fields(&mut readable, &mut defaults);
    error!("Unreadable settings fields fall back to their defaults: {reset:?}");
    if AppSettings::deserialize(&readable).is_err() {
        fill_missing_fields(&mut readable, defaults);
    }
    match load_stored_settings(readable) {
        Ok((settings, _)) => settings,
        Err(cause) => {
            error!("Stored settings could not be recovered field by field: {cause}");
            get_default_settings()
        }
    }
}

fn rewriting(
    settings: AppSettings,
    mut store_writes: Vec<(&'static str, serde_json::Value)>,
) -> SettingsLoad {
    if let Some(value) = serialize_settings(&settings) {
        store_writes.push((SETTINGS_KEY, value));
    }
    SettingsLoad {
        settings,
        store_writes,
    }
}

pub(super) fn load_settings(stored: Option<serde_json::Value>) -> SettingsLoad {
    let Some(raw) = stored else {
        return rewriting(get_default_settings(), Vec::new());
    };
    match load_stored_settings(raw.clone()) {
        Ok((settings, false)) => SettingsLoad {
            settings,
            store_writes: Vec::new(),
        },
        Ok((settings, true)) => rewriting(settings, Vec::new()),
        Err(cause) => {
            error!(
                "Stored settings do not parse ({cause}); original kept under '{UNREADABLE_SETTINGS_BACKUP_KEY}'"
            );
            let settings = recover_readable_fields(&raw);
            rewriting(settings, vec![(UNREADABLE_SETTINGS_BACKUP_KEY, raw)])
        }
    }
}
