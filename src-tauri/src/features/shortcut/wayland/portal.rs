use ashpd::desktop::global_shortcuts::{
    BindShortcuts, GlobalShortcuts, NewShortcut, Shortcut, ShortcutsChanged,
};
use ashpd::desktop::{Request, Session};
use ashpd::WindowIdentifier;
use futures_util::StreamExt;
use log::{debug, error, info, warn};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, oneshot};

use super::actions::{handle_activated, handle_deactivated};
use super::dconf;
use super::trigger::{to_portal_trigger, trigger_has_printable_key};
use super::{
    ManagedWaylandCommandSender, ManagedWaylandState, WaylandCommand, WaylandShortcutInfo,
};
use crate::actions::ACTION_MAP;
use crate::settings::{self, ShortcutBinding};

struct WaylandManager {
    portal: GlobalShortcuts<'static>,
    session: Session<'static, GlobalShortcuts<'static>>,
    app: AppHandle,
    commands: mpsc::Receiver<WaylandCommand>,
}

#[derive(Clone, Copy)]
struct PortalContext<'a> {
    portal: &'a GlobalShortcuts<'static>,
    app: &'a AppHandle,
}

pub async fn init_wayland_shortcuts(app: &AppHandle) -> Result<(), String> {
    info!("[Wayland] Initializing shortcuts through XDG Desktop Portal");
    log_environment();
    let (command_sender, command_receiver) = mpsc::channel(8);
    store_command_sender(app, command_sender);
    let (init_sender, init_receiver) = oneshot::channel();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = manager_task(app, command_receiver, init_sender).await {
            error!("[Wayland] Manager task exited: {error}");
        }
    });
    init_receiver
        .await
        .map_err(|_| "Manager task failed to signal init".to_string())?
}

fn log_environment() {
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
}

fn store_command_sender(app: &AppHandle, sender: mpsc::Sender<WaylandCommand>) {
    let Some(state) = app.try_state::<ManagedWaylandCommandSender>() else {
        return;
    };
    if let Ok(mut state) = state.lock() {
        *state = Some(sender);
    }
}

async fn manager_task(
    app: AppHandle,
    commands: mpsc::Receiver<WaylandCommand>,
    init_sender: oneshot::Sender<Result<(), String>>,
) -> Result<(), String> {
    let manager_result = WaylandManager::connect(app, commands).await;
    let mut manager = match manager_result {
        Ok(manager) => manager,
        Err(error) => {
            let _ = init_sender.send(Err(error.clone()));
            return Err(error);
        }
    };
    let initial_result = manager.bind(None).await.map(|_| ());
    let _ = init_sender.send(initial_result.clone());
    initial_result?;
    manager.run().await
}

impl WaylandManager {
    async fn connect(
        app: AppHandle,
        commands: mpsc::Receiver<WaylandCommand>,
    ) -> Result<Self, String> {
        let portal = GlobalShortcuts::new()
            .await
            .map_err(|error| portal_error("connect", error))?;
        let session = portal
            .create_session()
            .await
            .map_err(|error| portal_error("create session", error))?;
        info!("[Wayland] Connected and created shortcut session");
        Ok(Self {
            portal,
            session,
            app,
            commands,
        })
    }

    async fn bind(
        &self,
        window_identifier: Option<WindowIdentifier>,
    ) -> Result<Vec<WaylandShortcutInfo>, String> {
        let context = PortalContext {
            portal: &self.portal,
            app: &self.app,
        };
        bind_shortcuts(context, &self.session, window_identifier).await
    }

    async fn run(&mut self) -> Result<(), String> {
        let mut activated = self
            .portal
            .receive_activated()
            .await
            .map_err(|error| portal_error("receive activated events", error))?;
        let mut deactivated = self
            .portal
            .receive_deactivated()
            .await
            .map_err(|error| portal_error("receive deactivated events", error))?;
        let mut changed = self
            .portal
            .receive_shortcuts_changed()
            .await
            .map_err(|error| portal_error("receive shortcut changes", error))?;
        info!("[Wayland] Entering shortcut event loop");

        loop {
            tokio::select! {
                Some(event) = activated.next() => handle_activated(&self.app, event.shortcut_id()),
                Some(event) = deactivated.next() => handle_deactivated(&self.app, event.shortcut_id()),
                Some(event) = changed.next() => handle_changed(&self.app, event),
                Some(command) = self.commands.recv() => {
                    let context = PortalContext { portal: &self.portal, app: &self.app };
                    handle_command(context, &mut self.session, command).await;
                }
                else => break,
            }
        }
        warn!("[Wayland] Portal event streams closed");
        Ok(())
    }
}

fn portal_error(operation: &str, error: impl std::fmt::Display) -> String {
    let message = format!("Failed to {operation}: {error}");
    error!("[Wayland] {message}");
    message
}

async fn handle_command(
    context: PortalContext<'_>,
    session: &mut Session<'static, GlobalShortcuts<'static>>,
    command: WaylandCommand,
) {
    let WaylandCommand::Configure {
        window_identifier,
        respond,
    } = command;
    let result = configure(context, session, window_identifier).await;
    let _ = respond.send(result);
}

async fn configure(
    context: PortalContext<'_>,
    session: &mut Session<'static, GlobalShortcuts<'static>>,
    window_identifier: Option<WindowIdentifier>,
) -> Result<(), String> {
    let result = context
        .portal
        .configure_shortcuts(
            session,
            window_identifier.as_ref(),
            None::<ashpd::ActivationToken>,
        )
        .await;
    match result {
        Ok(()) => Ok(()),
        Err(ashpd::Error::RequiresVersion(required, actual)) => {
            warn!("[Wayland] Portal v{actual}; v{required} required, rebinding");
            rebind(context, session, window_identifier)
                .await
                .map(|_| ())
        }
        Err(error) => Err(portal_error("configure shortcuts", error)),
    }
}

async fn rebind(
    context: PortalContext<'_>,
    session: &mut Session<'static, GlobalShortcuts<'static>>,
    window_identifier: Option<WindowIdentifier>,
) -> Result<Vec<WaylandShortcutInfo>, String> {
    if let Err(error) = session.close().await {
        warn!("[Wayland] Failed to close old session: {error}");
    }
    let new_session = context
        .portal
        .create_session()
        .await
        .map_err(|error| portal_error("create replacement session", error))?;
    let result = bind_shortcuts(context, &new_session, window_identifier).await;
    if result.is_ok() {
        *session = new_session;
    }
    result
}

async fn bind_shortcuts(
    context: PortalContext<'_>,
    session: &Session<'static, GlobalShortcuts<'static>>,
    window_identifier: Option<WindowIdentifier>,
) -> Result<Vec<WaylandShortcutInfo>, String> {
    if let Err(error) = dconf::update_shortcuts(context.app) {
        warn!("[Wayland] Failed to update dconf shortcuts: {error}");
    }
    let bindings = active_bindings(context.app);
    if bindings.is_empty() {
        return Ok(Vec::new());
    }
    log_bindings(&bindings);
    let shortcuts = requested_shortcuts(&bindings);
    let request = context
        .portal
        .bind_shortcuts(session, &shortcuts, window_identifier.as_ref())
        .await
        .map_err(|error| portal_error("bind shortcuts", error))?;
    let _ = context
        .app
        .emit("wayland-shortcut-status", "waiting_for_authorization");
    let response = resolve_bind_response(context.app, request).await?;
    let infos = record_shortcuts(context.app, response.shortcuts());
    emit_ready(context.app, &infos);
    Ok(infos)
}

fn active_bindings(app: &AppHandle) -> Vec<ShortcutBinding> {
    settings::load_or_create_app_settings(app)
        .bindings
        .into_values()
        .filter(|binding| ACTION_MAP.contains_key(&binding.id))
        .collect()
}

fn log_bindings(bindings: &[ShortcutBinding]) {
    for binding in bindings {
        info!(
            "[Wayland] Preparing '{}': {} -> {}",
            binding.id,
            binding.current_binding,
            to_portal_trigger(&binding.current_binding)
        );
    }
}

fn requested_shortcuts(bindings: &[ShortcutBinding]) -> Vec<NewShortcut> {
    bindings
        .iter()
        .map(|binding| {
            let trigger = to_portal_trigger(&binding.current_binding);
            NewShortcut::new(&binding.id, &binding.description)
                .preferred_trigger(Some(trigger.as_str()))
        })
        .collect()
}

async fn resolve_bind_response(
    app: &AppHandle,
    request: Request<BindShortcuts>,
) -> Result<BindShortcuts, String> {
    let response = tauri::async_runtime::spawn_blocking(move || request.response())
        .await
        .map_err(|error| portal_error("join portal response task", error))?
        .map_err(|error| portal_error("authorize shortcuts", error));
    if response.is_err() {
        let _ = app.emit("wayland-shortcut-status", "authorization_failed");
    }
    response
}

fn record_shortcuts(app: &AppHandle, shortcuts: &[Shortcut]) -> Vec<WaylandShortcutInfo> {
    let infos = shortcuts.iter().map(shortcut_info).collect::<Vec<_>>();
    let Some(state) = app.try_state::<ManagedWaylandState>() else {
        return infos;
    };
    if let Ok(mut state) = state.lock() {
        state.triggers.extend(
            infos
                .iter()
                .map(|info| (info.id.clone(), info.trigger.clone())),
        );
        state.ready = true;
        state.last_error = None;
    }
    infos
}

fn shortcut_info(shortcut: &Shortcut) -> WaylandShortcutInfo {
    let id = shortcut.id().to_string();
    let trigger = shortcut.trigger_description().to_string();
    let has_printable_key = trigger_has_printable_key(&trigger);
    if has_printable_key {
        warn!("[Wayland] Shortcut '{id}' may leak printable trigger '{trigger}'");
    }
    WaylandShortcutInfo {
        id,
        trigger,
        has_printable_key,
    }
}

fn emit_ready(app: &AppHandle, infos: &[WaylandShortcutInfo]) {
    info!("[Wayland] Bound {} shortcut(s)", infos.len());
    let _ = app.emit("wayland-shortcuts-ready", infos);
    let _ = app.emit("wayland-shortcut-status", "ready");
}

fn handle_changed(app: &AppHandle, event: ShortcutsChanged) {
    let infos = record_shortcuts(app, event.shortcuts());
    let _ = app.emit("wayland-shortcuts-changed", &infos);
    let _ = app.emit("wayland-shortcut-status", "ready");
    info!("[Wayland] Updated {} shortcut(s)", infos.len());
}

pub async fn ensure_manager_running(app: &AppHandle) -> Result<(), String> {
    let state = app
        .try_state::<ManagedWaylandCommandSender>()
        .ok_or("Wayland state not initialized — call init_wayland_state first")?;
    let is_running = state
        .lock()
        .map_err(|error| format!("Lock error: {error}"))?
        .is_some();
    if is_running {
        return Ok(());
    }
    info!("[Wayland] Starting shortcut manager lazily");
    init_wayland_shortcuts(app).await
}

pub async fn request_configure(
    app: &AppHandle,
    window_identifier: Option<WindowIdentifier>,
) -> Result<(), String> {
    ensure_manager_running(app).await?;
    let sender = command_sender(app)?;
    let (respond, response) = oneshot::channel();
    sender
        .send(WaylandCommand::Configure {
            window_identifier,
            respond,
        })
        .await
        .map_err(|_| "Manager task not responding".to_string())?;
    response.await.map_err(|_| "Response lost".to_string())?
}

fn command_sender(app: &AppHandle) -> Result<mpsc::Sender<WaylandCommand>, String> {
    let state = app
        .try_state::<ManagedWaylandCommandSender>()
        .ok_or("Wayland manager not initialized")?;
    state
        .lock()
        .map_err(|error| format!("Lock error: {error}"))?
        .clone()
        .ok_or_else(|| "Wayland manager failed to start".to_string())
}
