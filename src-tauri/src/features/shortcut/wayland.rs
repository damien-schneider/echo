//! Wayland native global shortcuts via XDG Desktop Portal.
//!
//! This module provides global shortcut support for Wayland sessions using the
//! XDG Desktop Portal GlobalShortcuts interface. This is the official standard
//! for global shortcuts on Wayland and is supported by:
//! - GNOME 45+ (requires user permission via portal dialog)
//! - KDE Plasma 6+
//! - Other portal-compatible compositors
//!
//! ## Important Wayland limitations
//!
//! Unlike X11, Wayland's security model means:
//! 1. User must authorize shortcuts via a system dialog (one-time)
//! 2. Shortcuts do NOT consume keyboard events (they pass through to apps)
//! 3. Consider using shortcuts that don't conflict (e.g., Super+Shift+Space)
//!
//! ## Architecture
//!
//! A single long-lived async task ("manager task") owns the portal connection
//! and session for the entire app lifetime. Communication happens via tokio
//! channels — `request_configure()` sends a command and awaits the response.
//! This ensures the session is never dropped (which would deactivate shortcuts)
//! and that event streams share the same D-Bus connection as bind calls.

use ashpd::desktop::global_shortcuts::{GlobalShortcuts, NewShortcut, ShortcutsChanged};
use ashpd::WindowIdentifier;
use futures_util::StreamExt;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, oneshot};

use crate::actions::ACTION_MAP;
use crate::settings::{self, ShortcutBinding};
use crate::ManagedToggleState;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Command sent to the manager task via channel.
pub(crate) enum WaylandCommand {
    /// Open the system configuration dialog (portal v2).
    /// The actual shortcut changes arrive asynchronously via ShortcutsChanged signal.
    /// Falls back to session recreation + bind_shortcuts on portal v1.
    Configure {
        window_identifier: Option<WindowIdentifier>,
        respond: oneshot::Sender<Result<(), String>>,
    },
}

/// Stores the actual triggers assigned by the Wayland portal.
/// These may differ from what Echo requested if the user has previously authorized different shortcuts.
#[derive(Debug, Clone, Default)]
pub struct WaylandShortcutState {
    /// Map of shortcut_id -> actual trigger description from portal
    pub triggers: HashMap<String, String>,
    /// Whether shortcuts are ready
    pub ready: bool,
    /// Last error message if any
    pub last_error: Option<String>,
}

/// Type alias for managed Wayland shortcut state
pub type ManagedWaylandState = Arc<Mutex<WaylandShortcutState>>;

/// Managed state holding the command channel sender
pub type ManagedWaylandCommandSender = Arc<Mutex<Option<mpsc::Sender<WaylandCommand>>>>;

/// Information about a Wayland shortcut for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaylandShortcutInfo {
    pub id: String,
    /// The actual trigger as assigned by the portal (e.g., "Press <Control>space")
    pub trigger: String,
    /// Whether this shortcut has a printable key that may "leak" through
    pub has_printable_key: bool,
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/// Initialize the Wayland shortcut state and register it with Tauri.
/// Call this early in app initialization.
pub fn init_wayland_state(app: &AppHandle) {
    let state: ManagedWaylandState = Arc::new(Mutex::new(WaylandShortcutState::default()));
    let cmd_sender: ManagedWaylandCommandSender = Arc::new(Mutex::new(None));
    app.manage(state);
    app.manage(cmd_sender);
    debug!("[Wayland] Initialized shortcut state");
}

/// Check if we're running in a Wayland session.
pub fn is_wayland_session() -> bool {
    std::env::var("XDG_SESSION_TYPE")
        .map(|s| s.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
}

/// Initialize Wayland global shortcuts via XDG Desktop Portal.
///
/// Spawns a long-lived manager task that owns the portal connection + session.
/// The task handles both shortcut events and rebind requests via a channel.
/// Returns once the initial bind is complete (or fails).
pub async fn init_wayland_shortcuts(app: &AppHandle) -> Result<(), String> {
    info!("[Wayland] Initializing global shortcuts via XDG Desktop Portal");
    debug!(
        "[Wayland] XDG_SESSION_TYPE={:?}",
        std::env::var("XDG_SESSION_TYPE")
    );
    debug!(
        "[Wayland] WAYLAND_DISPLAY={:?}",
        std::env::var("WAYLAND_DISPLAY")
    );
    debug!(
        "[Wayland] XDG_CURRENT_DESKTOP={:?}",
        std::env::var("XDG_CURRENT_DESKTOP")
    );

    let (cmd_tx, cmd_rx) = mpsc::channel::<WaylandCommand>(8);
    let (init_tx, init_rx) = oneshot::channel::<Result<(), String>>();

    // Store command sender in app state so request_configure() can reach the task
    if let Some(sender_state) = app.try_state::<ManagedWaylandCommandSender>() {
        if let Ok(mut sender) = sender_state.lock() {
            *sender = Some(cmd_tx);
        }
    }

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = wayland_manager_task(app_clone, cmd_rx, init_tx).await {
            error!("[Wayland] Manager task exited with error: {}", e);
        }
    });

    // Wait for the initial bind to complete
    init_rx
        .await
        .map_err(|_| "Manager task failed to signal init".to_string())?
}

// ---------------------------------------------------------------------------
// Manager task (core fix — keeps session alive)
// ---------------------------------------------------------------------------

/// Long-lived async task that owns the portal connection and session.
///
/// - The portal connection lives for the entire app lifetime.
/// - Event streams are portal-level (not session-scoped) and persist across
///   session changes.
/// - On GNOME (portal v1), `bind_shortcuts` can only be called once per session.
///   Rebinding therefore closes the old session and creates a new one.
/// - Rebind requests arrive via `cmd_rx`.
async fn wayland_manager_task(
    app: AppHandle,
    mut cmd_rx: mpsc::Receiver<WaylandCommand>,
    init_tx: oneshot::Sender<Result<(), String>>,
) -> Result<(), String> {
    // 1. Connect to portal (ONE connection for lifetime)
    debug!("[Wayland] Manager task: connecting to GlobalShortcuts portal via D-Bus...");
    let portal = match GlobalShortcuts::new().await {
        Ok(p) => p,
        Err(e) => {
            let msg = format!("Failed to connect to GlobalShortcuts portal: {}. Ensure your desktop environment supports XDG Desktop Portal GlobalShortcuts (GNOME 45+, KDE Plasma 6+).", e);
            error!("[Wayland] {}", msg);
            let _ = init_tx.send(Err(msg.clone()));
            return Err(msg);
        }
    };
    info!("[Wayland] Manager task: connected to GlobalShortcuts portal");

    // 2. Create initial session
    debug!("[Wayland] Manager task: creating GlobalShortcuts session...");
    let mut session = match portal.create_session().await {
        Ok(s) => s,
        Err(e) => {
            let msg = format!("Failed to create GlobalShortcuts session: {}", e);
            error!("[Wayland] {}", msg);
            let _ = init_tx.send(Err(msg.clone()));
            return Err(msg);
        }
    };
    info!("[Wayland] Manager task: created GlobalShortcuts session successfully");

    // 3. Initial bind
    match do_bind_shortcuts(&portal, &session, &app, None).await {
        Ok(_) => {
            let _ = init_tx.send(Ok(()));
        }
        Err(e) => {
            let _ = init_tx.send(Err(e.clone()));
            return Err(e);
        }
    }

    // 4. Set up event streams — these are portal-level, not session-scoped,
    //    so they persist across session recreation.
    let mut activated = portal
        .receive_activated()
        .await
        .map_err(|e| format!("Failed to receive activated events: {}", e))?;
    let mut deactivated = portal
        .receive_deactivated()
        .await
        .map_err(|e| format!("Failed to receive deactivated events: {}", e))?;
    let mut shortcuts_changed = portal
        .receive_shortcuts_changed()
        .await
        .map_err(|e| format!("Failed to receive shortcuts_changed events: {}", e))?;

    info!("[Wayland] Manager task: entering event loop");

    // 5. Main event loop — select on events + configure/rebind commands
    loop {
        tokio::select! {
            Some(event) = activated.next() => {
                let shortcut_id = event.shortcut_id();
                debug!("[Wayland] Shortcut activated: {}", shortcut_id);
                handle_shortcut_activated(&app, shortcut_id);
            }
            Some(event) = deactivated.next() => {
                let shortcut_id = event.shortcut_id();
                debug!("[Wayland] Shortcut deactivated: {}", shortcut_id);
                handle_shortcut_deactivated(&app, shortcut_id);
            }
            Some(event) = shortcuts_changed.next() => {
                info!("[Wayland] Received ShortcutsChanged signal");
                handle_shortcuts_changed(&app, event);
            }
            Some(cmd) = cmd_rx.recv() => {
                match cmd {
                    WaylandCommand::Configure { window_identifier, respond } => {
                        info!("[Wayland] Processing configure request (portal v2)");
                        let result = portal.configure_shortcuts(
                            &session,
                            window_identifier.as_ref(),
                            None::<ashpd::ActivationToken>,
                        ).await;

                        match result {
                            Ok(()) => {
                                info!("[Wayland] Configure dialog opened successfully");
                                // Shortcut changes will arrive via ShortcutsChanged signal
                                let _ = respond.send(Ok(()));
                            }
                            Err(ashpd::Error::RequiresVersion(required, actual)) => {
                                warn!(
                                    "[Wayland] Portal v{} detected, configure_shortcuts requires v{}. Falling back to rebind.",
                                    actual, required
                                );
                                // Fallback: recreate session + bind_shortcuts (portal v1 behavior)
                                let fallback_result = do_rebind_fallback(
                                    &portal, &mut session, &app, window_identifier,
                                ).await;
                                let _ = respond.send(fallback_result.map(|_| ()));
                            }
                            Err(e) => {
                                error!("[Wayland] configure_shortcuts failed: {}", e);
                                let _ = respond.send(Err(format!("Configure failed: {}", e)));
                            }
                        }
                    }
                }
            }
            else => {
                warn!("[Wayland] All event streams and command channel closed, exiting manager task");
                break;
            }
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Bind helper (shared by init + rebind)
// ---------------------------------------------------------------------------

/// Bind (or rebind) shortcuts on the existing session.
///
/// Loads current bindings from settings, creates portal shortcut definitions,
/// calls `bind_shortcuts`, processes the response, and updates managed state.
async fn do_bind_shortcuts(
    portal: &GlobalShortcuts<'_>,
    session: &ashpd::desktop::Session<'_, GlobalShortcuts<'_>>,
    app: &AppHandle,
    window_identifier: Option<WindowIdentifier>,
) -> Result<Vec<WaylandShortcutInfo>, String> {
    // Update dconf with current triggers BEFORE binding.
    // GNOME caches shortcut triggers in dconf and ignores preferred_trigger;
    // without this, the portal always returns the stale cached value.
    if let Err(e) = update_dconf_shortcuts(app) {
        warn!("[Wayland] Failed to update dconf shortcuts (continuing): {}", e);
    }

    // Load settings and get bindings
    let settings = settings::load_or_create_app_settings(app);
    let bindings: Vec<(String, ShortcutBinding)> = settings
        .bindings
        .into_iter()
        .filter(|(_, b)| ACTION_MAP.contains_key(&b.id))
        .collect();

    if bindings.is_empty() {
        info!("[Wayland] No shortcut bindings to register");
        return Ok(Vec::new());
    }

    // Log the bindings we're about to register
    for (key, binding) in &bindings {
        let portal_trigger = to_portal_trigger(&binding.current_binding);
        info!(
            "[Wayland] Preparing shortcut '{}': {} -> Portal format: {}",
            key, binding.current_binding, portal_trigger
        );
    }

    // Create shortcut definitions for the portal
    let shortcuts: Vec<NewShortcut> = bindings
        .iter()
        .map(|(_, b)| {
            let trigger = to_portal_trigger(&b.current_binding);
            NewShortcut::new(&b.id, &b.description).preferred_trigger(Some(trigger.as_str()))
        })
        .collect();

    // Bind the shortcuts (this may trigger a user authorization dialog)
    info!(
        "[Wayland] Binding {} shortcut(s) - this may show a system authorization dialog...",
        shortcuts.len()
    );
    let request = portal
        .bind_shortcuts(session, &shortcuts, window_identifier.as_ref())
        .await
        .map_err(|e| {
            error!("[Wayland] Failed to bind shortcuts: {}", e);
            format!("Failed to bind shortcuts: {}", e)
        })?;
    debug!("[Wayland] bind_shortcuts request sent, waiting for portal response...");

    // Emit event to notify frontend
    let _ = app.emit("wayland-shortcut-status", "waiting_for_authorization");

    // response() is blocking (waits for D-Bus / user dialog) — run in spawn_blocking
    let bound_shortcuts = tauri::async_runtime::spawn_blocking(move || {
        request
            .response()
            .map_err(|e| format!("Portal response: {}", e))
    })
    .await
    .map_err(|e| {
        error!("[Wayland] spawn_blocking error: {}", e);
        let _ = app.emit("wayland-shortcut-status", "error");
        format!("spawn_blocking: {}", e)
    })?
    .map_err(|e| {
        error!(
            "[Wayland] Portal authorization failed or was cancelled: {}",
            e
        );
        let _ = app.emit("wayland-shortcut-status", "authorization_failed");
        format!(
            "Failed to get bind response (dialog cancelled or error): {}",
            e
        )
    })?;

    info!(
        "[Wayland] Successfully bound {} shortcut(s)",
        bound_shortcuts.shortcuts().len()
    );

    // Store the actual triggers from the portal and emit to frontend
    let mut shortcut_infos: Vec<WaylandShortcutInfo> = Vec::new();

    for shortcut in bound_shortcuts.shortcuts() {
        let trigger = shortcut.trigger_description().to_string();
        let id = shortcut.id().to_string();

        info!("[Wayland] Bound: id='{}', trigger='{}'", id, trigger);

        let has_printable = trigger_has_printable_key(&trigger);
        if has_printable {
            warn!(
                "[Wayland] Shortcut '{}' has printable key in trigger '{}' - may cause key leak issues",
                id, trigger
            );
        }

        shortcut_infos.push(WaylandShortcutInfo {
            id: id.clone(),
            trigger: trigger.clone(),
            has_printable_key: has_printable,
        });

        // Store in state
        if let Some(state) = app.try_state::<ManagedWaylandState>() {
            if let Ok(mut state) = state.lock() {
                state.triggers.insert(id, trigger);
            }
        }
    }

    // Mark state as ready
    if let Some(state) = app.try_state::<ManagedWaylandState>() {
        if let Ok(mut state) = state.lock() {
            state.ready = true;
            state.last_error = None;
        }
    }

    // Emit the actual shortcut info to frontend
    let _ = app.emit("wayland-shortcuts-ready", &shortcut_infos);
    debug!(
        "[Wayland] Emitted shortcut info to frontend: {:?}",
        shortcut_infos
    );

    // Emit success event
    let _ = app.emit("wayland-shortcut-status", "ready");

    Ok(shortcut_infos)
}

// ---------------------------------------------------------------------------
// Rebind fallback (portal v1 — recreate session + bind)
// ---------------------------------------------------------------------------

/// Fallback for portal v1: close the current session, create a new one, and
/// call bind_shortcuts again. This is the only way to change shortcuts on
/// portals that don't support ConfigureShortcuts (v2).
///
/// GNOME's portal caches shortcut triggers in dconf and ignores
/// `preferred_trigger` on subsequent `bind_shortcuts` calls. To work around
/// this, we update the dconf entries directly before rebinding so the portal
/// picks up the new trigger values.
async fn do_rebind_fallback<'a>(
    portal: &GlobalShortcuts<'a>,
    session: &mut ashpd::desktop::Session<'a, GlobalShortcuts<'a>>,
    app: &AppHandle,
    window_identifier: Option<WindowIdentifier>,
) -> Result<Vec<WaylandShortcutInfo>, String> {
    info!("[Wayland] Rebind fallback: recreating session");

    // Note: dconf update is handled by do_bind_shortcuts() before binding.

    if let Err(e) = session.close().await {
        warn!("[Wayland] Failed to close old session (continuing): {}", e);
    }

    match portal.create_session().await {
        Ok(new_session) => {
            let result = do_bind_shortcuts(portal, &new_session, app, window_identifier).await;
            if result.is_ok() {
                *session = new_session;
            }
            result
        }
        Err(e) => {
            let msg = format!("Failed to create new session: {}", e);
            error!("[Wayland] {}", msg);
            Err(msg)
        }
    }
}

// ---------------------------------------------------------------------------
// dconf shortcut update (GNOME portal v1 workaround)
// ---------------------------------------------------------------------------

/// Update dconf entries so GNOME's portal returns the correct trigger on rebind.
///
/// GNOME stores authorized shortcuts in dconf at
/// `/org/gnome/settings-daemon/global-shortcuts/{app_id}/shortcuts`.
/// When `bind_shortcuts` is called, the portal reads from dconf and returns
/// the cached trigger, completely ignoring `preferred_trigger`. This function
/// scans all app entries in dconf and updates any that contain our shortcut IDs
/// with the new trigger values from Echo's settings.
fn update_dconf_shortcuts(app: &AppHandle) -> Result<(), String> {
    use std::process::Command;

    let settings = settings::load_or_create_app_settings(app);
    let bindings: Vec<(String, settings::ShortcutBinding)> = settings
        .bindings
        .into_iter()
        .filter(|(_, b)| ACTION_MAP.contains_key(&b.id))
        .collect();

    if bindings.is_empty() {
        return Ok(());
    }

    // Build the new GVariant value with all our shortcuts
    let entries: Vec<String> = bindings
        .iter()
        .map(|(_, b)| {
            let gtk_trigger = to_gtk_accelerator(&b.current_binding);
            format!(
                "('{}', {{'shortcuts': <['{}']>, 'description': <'{}'>}})",
                b.id, gtk_trigger, b.description
            )
        })
        .collect();
    let new_value = format!("[{}]", entries.join(", "));
    info!("[Wayland] dconf update value: {}", new_value);

    // List all app entries in dconf
    let output = Command::new("dconf")
        .args(["list", "/org/gnome/settings-daemon/global-shortcuts/"])
        .output()
        .map_err(|e| format!("dconf list failed: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "dconf list failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let listing = String::from_utf8_lossy(&output.stdout);
    let mut updated_count = 0;

    for line in listing.lines() {
        let line = line.trim();
        // Skip non-directory entries (like "applications")
        if !line.ends_with('/') {
            continue;
        }
        let app_id = line.trim_end_matches('/');
        if app_id.is_empty() {
            continue;
        }

        // Read current shortcuts for this app
        let path = format!(
            "/org/gnome/settings-daemon/global-shortcuts/{}/shortcuts",
            app_id
        );
        let read = Command::new("dconf")
            .args(["read", &path])
            .output()
            .map_err(|e| format!("dconf read failed: {}", e))?;

        let value = String::from_utf8_lossy(&read.stdout);

        // Check if this entry has any of our shortcut IDs
        let has_our_shortcuts = bindings
            .iter()
            .any(|(_, b)| value.contains(&format!("'{}'", b.id)));

        if has_our_shortcuts {
            info!(
                "[Wayland] Updating dconf shortcuts for app '{}' at {}",
                app_id, path
            );
            let write = Command::new("dconf")
                .args(["write", &path, &new_value])
                .output()
                .map_err(|e| format!("dconf write failed: {}", e))?;

            if !write.status.success() {
                let stderr = String::from_utf8_lossy(&write.stderr);
                error!(
                    "[Wayland] dconf write failed for '{}': {}",
                    app_id, stderr
                );
            } else {
                info!(
                    "[Wayland] Successfully updated dconf shortcuts for '{}'",
                    app_id
                );
                updated_count += 1;
            }
        }
    }

    if updated_count == 0 {
        info!("[Wayland] No existing dconf entries found for our shortcuts (first run or app ID unknown)");
    } else {
        info!(
            "[Wayland] Updated {} dconf app entries with new triggers",
            updated_count
        );
    }

    Ok(())
}

/// Convert Echo's binding format to GTK accelerator format used in dconf.
///
/// Example: "ctrl+shift+r" → "<Control><Shift>r"
/// Example: "ctrl+space" → "<Control>space"
fn to_gtk_accelerator(binding: &str) -> String {
    let parts: Vec<&str> = binding.split('+').map(str::trim).collect();
    let mut result = String::new();
    for part in &parts {
        match part.to_lowercase().as_str() {
            "ctrl" | "control" => result.push_str("<Control>"),
            "alt" | "option" => result.push_str("<Alt>"),
            "shift" => result.push_str("<Shift>"),
            "meta" | "cmd" | "command" | "super" | "win" | "windows" => {
                result.push_str("<Super>")
            }
            key => result.push_str(key),
        }
    }
    result
}

// ---------------------------------------------------------------------------
// ShortcutsChanged handler
// ---------------------------------------------------------------------------

/// Handle the ShortcutsChanged signal from the portal.
/// This is emitted when the user changes shortcuts via the system configuration
/// dialog (opened by configure_shortcuts).
fn handle_shortcuts_changed(app: &AppHandle, event: ShortcutsChanged) {
    let mut shortcut_infos: Vec<WaylandShortcutInfo> = Vec::new();

    for shortcut in event.shortcuts() {
        let id = shortcut.id().to_string();
        let trigger = shortcut.trigger_description().to_string();

        info!(
            "[Wayland] Shortcut changed: id='{}', new trigger='{}'",
            id, trigger
        );

        let has_printable = trigger_has_printable_key(&trigger);
        if has_printable {
            warn!(
                "[Wayland] Changed shortcut '{}' has printable key in trigger '{}' - may cause key leak issues",
                id, trigger
            );
        }

        shortcut_infos.push(WaylandShortcutInfo {
            id: id.clone(),
            trigger: trigger.clone(),
            has_printable_key: has_printable,
        });

        // Update managed state
        if let Some(state) = app.try_state::<ManagedWaylandState>() {
            if let Ok(mut state) = state.lock() {
                state.triggers.insert(id, trigger);
            }
        }
    }

    // Emit to frontend so UI updates with the new triggers
    let _ = app.emit("wayland-shortcuts-changed", &shortcut_infos);
    let _ = app.emit("wayland-shortcut-status", "ready");
    info!(
        "[Wayland] Emitted shortcuts-changed to frontend ({} shortcut(s))",
        shortcut_infos.len()
    );
}

// ---------------------------------------------------------------------------
// Public API for configuring shortcuts
// ---------------------------------------------------------------------------

/// Ensure the Wayland manager task is running.
/// If not yet started or previously failed, this spawns it and waits for init.
pub async fn ensure_manager_running(app: &AppHandle) -> Result<(), String> {
    // Check if the manager is already running by testing the command sender
    {
        let state = app
            .try_state::<ManagedWaylandCommandSender>()
            .ok_or("Wayland state not initialized — call init_wayland_state first")?;
        let guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        if guard.is_some() {
            // Manager is running (or at least was started)
            return Ok(());
        }
    }

    // Manager is not running — start it now
    info!("[Wayland] Manager not running, starting lazily...");
    init_wayland_shortcuts(app).await
}

/// Request opening the system configuration dialog for shortcuts (portal v2).
///
/// Sends a Configure command to the manager task. The dialog is opened by the
/// portal; actual shortcut changes arrive asynchronously via ShortcutsChanged.
/// Falls back to rebind on portal v1.
///
/// If the manager task is not running, it will be started lazily.
pub async fn request_configure(
    app: &AppHandle,
    window_identifier: Option<WindowIdentifier>,
) -> Result<(), String> {
    // Ensure the manager is running (lazy-init if needed)
    ensure_manager_running(app).await?;

    let tx = {
        let state = app
            .try_state::<ManagedWaylandCommandSender>()
            .ok_or("Wayland manager not initialized")?;
        let guard = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        guard
            .clone()
            .ok_or("Wayland manager failed to start".to_string())?
    };

    let (respond_tx, respond_rx) = oneshot::channel();
    tx.send(WaylandCommand::Configure {
        window_identifier,
        respond: respond_tx,
    })
    .await
    .map_err(|_| "Manager task not responding".to_string())?;

    respond_rx.await.map_err(|_| "Response lost".to_string())?
}

/// Open the system dialog to configure Wayland shortcuts.
/// Uses portal v2 ConfigureShortcuts to show the native configuration UI.
/// Falls back to rebind (session recreation) on portal v1.
pub async fn open_wayland_shortcut_settings(app: &AppHandle) -> Result<(), String> {
    if !is_wayland_session() {
        return Err("Not running on Wayland".to_string());
    }

    info!("[Wayland] Opening shortcut settings dialog...");

    let window_identifier = get_window_identifier(app).await;
    debug!("[Wayland] Window identifier: {:?}", window_identifier);

    request_configure(app, window_identifier).await.map_err(|e| {
        error!(
            "[Wayland] Failed to open shortcut settings dialog: {}",
            e
        );
        e
    })
}

// ---------------------------------------------------------------------------
// Trigger conversion helpers
// ---------------------------------------------------------------------------

/// Convert our binding string (e.g. "ctrl+shift+space") to XDG Portal format.
/// XDG Portal uses: Control, Alt, Shift, Super as modifier names.
fn to_portal_trigger(binding: &str) -> String {
    let parts: Vec<&str> = binding.split('+').map(str::trim).collect();
    let converted: Vec<&str> = parts
        .iter()
        .map(|p| {
            match p.to_lowercase().as_str() {
                "ctrl" | "control" => "Control",
                "alt" | "option" => "Alt",
                "shift" => "Shift",
                "meta" | "cmd" | "command" | "super" | "win" | "windows" => "Super",
                // Keep key name as-is (space, a, b, f1, etc.)
                _ => *p,
            }
        })
        .collect();
    converted.join("+")
}

/// Check if a key is "printable" (produces a character when pressed).
/// These keys cause issues on Wayland because the shortcut doesn't consume the key event.
fn is_printable_key(key: &str) -> bool {
    let key_lower = key.to_lowercase();
    // Space is the most common problematic key
    if key_lower == "space" {
        return true;
    }
    // Single character keys (letters, numbers)
    if key_lower.len() == 1 {
        let c = key_lower.chars().next().unwrap();
        return c.is_alphanumeric();
    }
    // Numpad keys
    if key_lower.starts_with("num") || key_lower.starts_with("kp") {
        return true;
    }
    false
}

/// Get the printable key from a shortcut binding, if any.
fn get_printable_key_from_binding(binding: &str) -> Option<String> {
    let modifiers = [
        "ctrl", "control", "shift", "alt", "option", "meta", "command", "cmd", "super", "win",
        "windows",
    ];
    for part in binding.split('+') {
        let part = part.trim().to_lowercase();
        if !modifiers.contains(&part.as_str()) && is_printable_key(&part) {
            return Some(part);
        }
    }
    None
}

/// Simulate a backspace key press using wtype to remove the "leaked" character.
/// This is a workaround for Wayland's limitation where shortcuts don't consume key events.
fn send_backspace_workaround() {
    use std::process::Command;

    // Small delay to ensure the character has been typed
    std::thread::sleep(std::time::Duration::from_millis(30));

    // Use wtype to simulate backspace
    match Command::new("wtype").arg("-k").arg("BackSpace").output() {
        Ok(output) => {
            if output.status.success() {
                debug!("[Wayland] Backspace workaround sent successfully");
            } else {
                warn!(
                    "[Wayland] wtype backspace failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
        }
        Err(e) => {
            // wtype might not be installed - this is expected in some cases
            debug!(
                "[Wayland] Could not execute wtype for backspace workaround: {}",
                e
            );
        }
    }
}

/// Check if we need to apply the backspace workaround for a shortcut.
/// Returns true if the shortcut contains a printable key that would "leak" through.
/// Uses the ACTUAL trigger from the portal, not what Echo requested.
pub fn needs_backspace_workaround(app: &AppHandle, shortcut_id: &str) -> bool {
    // First try to get the actual trigger from Wayland state
    if let Some(state) = app.try_state::<ManagedWaylandState>() {
        if let Ok(state) = state.lock() {
            if let Some(trigger) = state.triggers.get(shortcut_id) {
                debug!(
                    "[Wayland] Checking backspace need for actual trigger: {}",
                    trigger
                );
                // Parse the portal trigger format (e.g., "Press <Control>space")
                return trigger_has_printable_key(trigger);
            }
        }
    }
    // Fallback to settings-based check
    let bindings = settings::get_bindings(app);
    if let Some(binding) = bindings.get(shortcut_id) {
        return get_printable_key_from_binding(&binding.current_binding).is_some();
    }
    false
}

/// Check if a portal trigger description contains a printable key.
/// Portal format is like "Press <Control>space" or "Press <Control><Shift>r"
fn trigger_has_printable_key(trigger: &str) -> bool {
    // Extract the key part after the last > or just the last word
    let key = trigger
        .rsplit_once('>')
        .map(|(_, k)| k.trim())
        .unwrap_or_else(|| trigger.split_whitespace().last().unwrap_or(""));
    is_printable_key(key)
}

/// Check if a shortcut binding has a printable key (for UI warnings).
pub fn check_wayland_shortcut_conflict(binding: String) -> Option<String> {
    if !is_wayland_session() {
        return None;
    }
    get_printable_key_from_binding(&binding)
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/// Handle shortcut activation (key pressed).
fn handle_shortcut_activated(app: &AppHandle, shortcut_id: &str) {
    let Some(action) = ACTION_MAP.get(shortcut_id) else {
        warn!("[Wayland] No action found for shortcut ID: {}", shortcut_id);
        return;
    };

    // Apply backspace workaround if needed (before the action to clean up leaked character)
    if needs_backspace_workaround(app, shortcut_id) {
        debug!(
            "[Wayland] Applying backspace workaround for shortcut '{}'",
            shortcut_id
        );
        // Spawn in a separate thread to avoid blocking the event loop
        std::thread::spawn(send_backspace_workaround);
    }

    let settings = settings::get_settings(app);

    if settings.push_to_talk {
        // Push-to-talk mode: start on press
        info!("[Wayland] PTT mode: starting action for '{}'", shortcut_id);
        action.start(app, shortcut_id, shortcut_id);
    } else {
        // Toggle mode: toggle state on press
        let toggle_state = app.state::<ManagedToggleState>();

        if let Ok(mut states) = toggle_state.lock() {
            let is_active = states
                .active_toggles
                .entry(shortcut_id.to_string())
                .or_insert(false);

            if *is_active {
                info!(
                    "[Wayland] Toggle mode: stopping action for '{}'",
                    shortcut_id
                );
                action.stop(app, shortcut_id, shortcut_id);
                *is_active = false;
            } else {
                info!(
                    "[Wayland] Toggle mode: starting action for '{}'",
                    shortcut_id
                );
                action.start(app, shortcut_id, shortcut_id);
                *is_active = true;
            }
        } else {
            error!("[Wayland] Failed to lock toggle state");
        };
    }
}

/// Handle shortcut deactivation (key released).
fn handle_shortcut_deactivated(app: &AppHandle, shortcut_id: &str) {
    let Some(action) = ACTION_MAP.get(shortcut_id) else {
        return;
    };

    let settings = settings::get_settings(app);

    if settings.push_to_talk {
        // Push-to-talk mode: stop on release
        info!("[Wayland] PTT mode: stopping action for '{}'", shortcut_id);
        action.stop(app, shortcut_id, shortcut_id);
    }
    // Toggle mode: do nothing on release (toggle happens on press)
}

// ---------------------------------------------------------------------------
// Window identifier (FFI)
// ---------------------------------------------------------------------------

/// Get a WindowIdentifier for portal dialogs.
/// Returns None if the main window cannot be found or the identifier cannot be created.
async fn get_window_identifier(app: &AppHandle) -> Option<WindowIdentifier> {
    use gtk::glib::translate::ToGlibPtr;
    use gtk::prelude::*;
    use raw_window_handle::{
        RawDisplayHandle, RawWindowHandle, WaylandDisplayHandle, WaylandWindowHandle,
    };
    use std::ptr::NonNull;

    // Declare the GDK Wayland FFI functions we need
    extern "C" {
        fn gdk_wayland_display_get_wl_display(
            display: *mut gdk::ffi::GdkDisplay,
        ) -> *mut std::ffi::c_void;
        fn gdk_wayland_window_get_wl_surface(
            window: *mut gdk::ffi::GdkWindow,
        ) -> *mut std::ffi::c_void;
    }

    // Try to get the main window
    // Use a block to constrain the lifetime of non-Send GTK objects
    let rx = {
        let window = app.get_webview_window("main")?;
        let gtk_window = window.gtk_window().ok()?;
        let gdk_window = gtk_window.window()?;

        let display = gdk_window.display();

        unsafe {
            let display_ptr = display.to_glib_none().0;
            let window_ptr = gdk_window.to_glib_none().0;

            // Call FFI functions to get raw Wayland pointers
            let wl_display_ptr = gdk_wayland_display_get_wl_display(display_ptr);
            let wl_surface_ptr = gdk_wayland_window_get_wl_surface(window_ptr);

            if wl_display_ptr.is_null() || wl_surface_ptr.is_null() {
                warn!(
                    "[Wayland] One of the raw pointers is null. Display: {:?}, Surface: {:?}",
                    wl_display_ptr, wl_surface_ptr
                );
                return None;
            }

            // Cast pointers to addresses to move them to another thread
            let display_addr = wl_display_ptr as usize;
            let surface_addr = wl_surface_ptr as usize;

            let (tx, rx) = tokio::sync::oneshot::channel();

            std::thread::spawn(move || {
                // Create a single-threaded runtime for ashpd
                let rt = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(rt) => rt,
                    Err(_) => {
                        let _ = tx.send(None);
                        return;
                    }
                };

                rt.block_on(async {
                    // Reconstruct pointers (Safety: ensured not null above)
                    // We use NonNull::new_unchecked because we checked is_null() before spawn
                    let d_ptr = NonNull::new_unchecked(display_addr as *mut std::ffi::c_void);
                    let s_ptr = NonNull::new_unchecked(surface_addr as *mut std::ffi::c_void);

                    let d_handle = WaylandDisplayHandle::new(d_ptr);
                    let display_handle = RawDisplayHandle::Wayland(d_handle);

                    let w_handle = WaylandWindowHandle::new(s_ptr);
                    let window_handle = RawWindowHandle::Wayland(w_handle);

                    debug!(
                        "[Wayland] Calling WindowIdentifier::from_raw_handle in dedicated thread"
                    );
                    let result =
                        WindowIdentifier::from_raw_handle(&window_handle, Some(&display_handle))
                            .await;

                    // Send result back
                    let _ = tx.send(result);
                });
            });

            rx
        }
    }; // GTK objects dropped here

    rx.await.ok().flatten()
}

// ---------------------------------------------------------------------------
// Read-only state accessors
// ---------------------------------------------------------------------------

/// Get the current Wayland shortcuts with their actual triggers from the portal.
/// Returns an empty list if not on Wayland or if shortcuts haven't been initialized yet.
pub fn get_wayland_shortcuts(app: &AppHandle) -> Vec<WaylandShortcutInfo> {
    if !is_wayland_session() {
        return Vec::new();
    }

    let Some(state) = app.try_state::<ManagedWaylandState>() else {
        debug!("[Wayland] No managed state found when getting shortcuts");
        return Vec::new();
    };

    let Ok(state) = state.lock() else {
        warn!("[Wayland] Failed to lock state when getting shortcuts");
        return Vec::new();
    };

    if !state.ready {
        debug!("[Wayland] Shortcuts not ready yet");
        return Vec::new();
    }

    state
        .triggers
        .iter()
        .map(|(id, trigger)| WaylandShortcutInfo {
            id: id.clone(),
            trigger: trigger.clone(),
            has_printable_key: trigger_has_printable_key(trigger),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_portal_trigger() {
        assert_eq!(to_portal_trigger("ctrl+space"), "Control+space");
        assert_eq!(to_portal_trigger("ctrl+shift+space"), "Control+Shift+space");
        assert_eq!(to_portal_trigger("alt+a"), "Alt+a");
        assert_eq!(to_portal_trigger("super+shift+f1"), "Super+Shift+f1");
        assert_eq!(to_portal_trigger("meta+x"), "Super+x");
    }

    #[test]
    fn test_to_gtk_accelerator() {
        assert_eq!(to_gtk_accelerator("ctrl+space"), "<Control>space");
        assert_eq!(
            to_gtk_accelerator("ctrl+shift+r"),
            "<Control><Shift>r"
        );
        assert_eq!(to_gtk_accelerator("alt+a"), "<Alt>a");
        assert_eq!(
            to_gtk_accelerator("super+shift+f1"),
            "<Super><Shift>f1"
        );
        assert_eq!(to_gtk_accelerator("meta+x"), "<Super>x");
    }

    #[test]
    fn test_trigger_has_printable_key() {
        assert!(trigger_has_printable_key("Press <Control>space"));
        assert!(trigger_has_printable_key("Press <Control><Shift>a"));
        assert!(!trigger_has_printable_key("Press <Control><Shift>F1"));
        assert!(!trigger_has_printable_key("Press <Super><Shift>Escape"));
    }
}
