use log::{error, info};
use std::process::{Command, Output};
use tauri::AppHandle;

use super::trigger::to_gtk_accelerator;
use crate::actions::ACTION_MAP;
use crate::settings::{self, ShortcutBinding};

pub(super) fn update_shortcuts(app: &AppHandle) -> Result<(), String> {
    let bindings = active_bindings(app);
    if bindings.is_empty() {
        return Ok(());
    }

    let new_value = dconf_value(&bindings);
    info!("[Wayland] dconf update value: {new_value}");
    let app_ids = list_application_ids()?;
    let updated_count = app_ids
        .iter()
        .map(|app_id| update_matching_application(app_id, &bindings, &new_value))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|updated| *updated)
        .count();
    info!("[Wayland] Updated {updated_count} matching dconf app entries");
    Ok(())
}

fn active_bindings(app: &AppHandle) -> Vec<ShortcutBinding> {
    settings::load_or_create_app_settings(app)
        .bindings
        .into_values()
        .filter(|binding| ACTION_MAP.contains_key(&binding.id))
        .collect()
}

fn dconf_value(bindings: &[ShortcutBinding]) -> String {
    let entries = bindings
        .iter()
        .map(|binding| {
            let trigger = to_gtk_accelerator(&binding.current_binding);
            format!(
                "('{}', {{'shortcuts': <['{}']>, 'description': <'{}'>}})",
                binding.id, trigger, binding.description
            )
        })
        .collect::<Vec<_>>();
    format!("[{}]", entries.join(", "))
}

fn list_application_ids() -> Result<Vec<String>, String> {
    let output = run_dconf(&["list", "/org/gnome/settings-daemon/global-shortcuts/"])?;
    output
        .status
        .success()
        .then(|| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(application_id)
                .collect()
        })
        .ok_or_else(|| command_error("dconf list", &output))
}

fn application_id(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let id = trimmed.strip_suffix('/')?;
    (!id.is_empty()).then(|| id.to_string())
}

fn update_matching_application(
    app_id: &str,
    bindings: &[ShortcutBinding],
    new_value: &str,
) -> Result<bool, String> {
    let path = format!("/org/gnome/settings-daemon/global-shortcuts/{app_id}/shortcuts");
    let read = run_dconf(&["read", &path])?;
    let current_value = String::from_utf8_lossy(&read.stdout);
    let matches = bindings
        .iter()
        .any(|binding| current_value.contains(&format!("'{}'", binding.id)));
    if !matches {
        return Ok(false);
    }

    info!("[Wayland] Updating dconf shortcuts for '{app_id}'");
    let write = run_dconf(&["write", &path, new_value])?;
    if write.status.success() {
        return Ok(true);
    }
    error!("{}", command_error("dconf write", &write));
    Ok(false)
}

fn run_dconf(args: &[&str]) -> Result<Output, String> {
    Command::new("dconf")
        .args(args)
        .output()
        .map_err(|error| format!("dconf command failed: {error}"))
}

fn command_error(operation: &str, output: &Output) -> String {
    format!(
        "{operation} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    )
}
