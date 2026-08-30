use super::layout::{
    hud_yields_to_notification, parse_hud_mode, parse_notification_mode, OverlayPlacement,
    OverlaySurfaceKind, RecordingOverlayMode,
};
use super::surface::OverlaySurfacePayload;
use super::window::{overlay_surface_payload_for, render_overlay_surface, OverlayRender};
use crate::settings::{self, OverlayPosition};
use log::warn;
use std::sync::Mutex;
use tauri::AppHandle;

/// The pending mode keeps the window covering both surfaces until the webview reports the morph done.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct SurfaceModeState {
    pending: Option<RecordingOverlayMode>,
    settled: Option<RecordingOverlayMode>,
}

/// HUD is always up while the overlay is enabled; the notification starts empty.
static HUD_MODE: Mutex<SurfaceModeState> = Mutex::new(SurfaceModeState {
    pending: None,
    settled: Some(RecordingOverlayMode::Compact),
});
static NOTIFICATION_MODE: Mutex<SurfaceModeState> = Mutex::new(SurfaceModeState {
    pending: None,
    settled: None,
});

fn current_state(state: &Mutex<SurfaceModeState>) -> SurfaceModeState {
    match state.lock() {
        Ok(current) => *current,
        Err(poisoned) => **poisoned.get_ref(),
    }
}

fn replace_state(state: &Mutex<SurfaceModeState>, next: SurfaceModeState) {
    match state.lock() {
        Ok(mut current) => *current = next,
        Err(poisoned) => *poisoned.into_inner() = next,
    }
}

fn render_mode(state: SurfaceModeState) -> Option<RecordingOverlayMode> {
    state.pending.or(state.settled)
}

/// Frame must not move out from under an in-flight morph.
fn covered_modes(
    state: SurfaceModeState,
    rendered: RecordingOverlayMode,
) -> Vec<RecordingOverlayMode> {
    [state.settled, state.pending]
        .into_iter()
        .flatten()
        .filter(|mode| *mode != rendered)
        .collect()
}

fn stage_mode(state: SurfaceModeState, mode: RecordingOverlayMode) -> SurfaceModeState {
    SurfaceModeState {
        pending: Some(mode),
        settled: state.settled,
    }
}

fn settle_mode(state: SurfaceModeState, mode: RecordingOverlayMode) -> Option<SurfaceModeState> {
    (state.pending == Some(mode)).then_some(SurfaceModeState {
        pending: None,
        settled: Some(mode),
    })
}

fn overlay_placement(app_handle: &AppHandle) -> Option<OverlayPlacement> {
    let settings = settings::get_settings(app_handle);
    (settings.overlay_position != OverlayPosition::None)
        .then(|| OverlayPlacement::from_settings(&settings))
}

fn notification_is_visible() -> bool {
    render_mode(current_state(&NOTIFICATION_MODE)).is_some()
}

fn hud_mode_to_render(
    app_handle: &AppHandle,
    state: SurfaceModeState,
) -> Option<RecordingOverlayMode> {
    let placement = overlay_placement(app_handle)?;
    if notification_is_visible() && hud_yields_to_notification(placement) {
        return None;
    }
    render_mode(state)
}

fn render_surface(
    app_handle: &AppHandle,
    kind: OverlaySurfaceKind,
    state: SurfaceModeState,
    mode: Option<RecordingOverlayMode>,
) -> Result<(), String> {
    render_overlay_surface(OverlayRender {
        app_handle,
        covered: mode
            .map(|mode| covered_modes(state, mode))
            .unwrap_or_default(),
        kind,
        mode,
    })
}

fn render_hud(app_handle: &AppHandle) -> Result<(), String> {
    let state = current_state(&HUD_MODE);
    let mode = hud_mode_to_render(app_handle, state);
    render_surface(app_handle, OverlaySurfaceKind::Hud, state, mode)
}

fn render_notification(app_handle: &AppHandle) -> Result<(), String> {
    let state = current_state(&NOTIFICATION_MODE);
    let mode = overlay_placement(app_handle).and_then(|_| render_mode(state));
    render_surface(app_handle, OverlaySurfaceKind::Notification, state, mode)
}

/// Both windows share a monitor and settings — placement changes redraw the pair.
pub(crate) fn update_overlay_position(app_handle: &AppHandle) {
    if let Err(error) = render_notification(app_handle) {
        warn!("[Overlay] Failed to update the notification surface: {error}");
    }
    if let Err(error) = render_hud(app_handle) {
        warn!("[Overlay] Failed to update overlay position: {error}");
    }
}

pub(super) fn set_hud_mode(app_handle: &AppHandle, mode: &str) -> Result<(), String> {
    let requested = parse_hud_mode(mode)?;
    let state = current_state(&HUD_MODE);
    let staged = stage_mode(state, requested);
    replace_state(&HUD_MODE, staged);
    let rendered = hud_mode_to_render(app_handle, staged);
    if let Err(error) = render_surface(app_handle, OverlaySurfaceKind::Hud, state, rendered) {
        replace_state(&HUD_MODE, state);
        return Err(error);
    }
    Ok(())
}

pub(super) fn settle_hud_mode(app_handle: &AppHandle, mode: &str) -> Result<(), String> {
    let mode = parse_hud_mode(mode)?;
    let state = current_state(&HUD_MODE);
    let Some(settled) = settle_mode(state, mode) else {
        return Ok(());
    };
    replace_state(&HUD_MODE, settled);
    let result = render_hud(app_handle);
    if result.is_err() {
        replace_state(&HUD_MODE, state);
    }
    result
}

/// Toggling the notification can uncover a HUD that stood down for it — redraw both.
pub(super) fn set_notification_mode(app_handle: &AppHandle, mode: &str) -> Result<(), String> {
    let requested = parse_notification_mode(mode)?;
    let state = current_state(&NOTIFICATION_MODE);
    replace_state(&NOTIFICATION_MODE, stage_mode(state, requested));
    let result = render_surface(
        app_handle,
        OverlaySurfaceKind::Notification,
        state,
        Some(requested),
    );
    if let Err(ref error) = result {
        // The webview asked for a surface and got none: without this line the island is simply
        // never there, and nothing anywhere says why.
        warn!("[Overlay] Failed to show the notification surface: {error}");
        replace_state(&NOTIFICATION_MODE, state);
    }
    render_hud(app_handle).and(result)
}

pub(super) fn settle_notification_mode(app_handle: &AppHandle, mode: &str) -> Result<(), String> {
    let mode = parse_notification_mode(mode)?;
    let state = current_state(&NOTIFICATION_MODE);
    let Some(settled) = settle_mode(state, mode) else {
        return Ok(());
    };
    replace_state(&NOTIFICATION_MODE, settled);
    let result = render_notification(app_handle);
    if result.is_err() {
        replace_state(&NOTIFICATION_MODE, state);
    }
    result
}

pub(super) fn hide_notification(app_handle: &AppHandle) -> Result<(), String> {
    replace_state(
        &NOTIFICATION_MODE,
        SurfaceModeState {
            pending: None,
            settled: None,
        },
    );
    let result = render_notification(app_handle);
    render_hud(app_handle).and(result)
}

pub(super) fn hud_surface_payload() -> Option<OverlaySurfacePayload> {
    overlay_surface_payload_for(OverlaySurfaceKind::Hud)
}

pub(super) fn notification_surface_payload() -> Option<OverlaySurfacePayload> {
    overlay_surface_payload_for(OverlaySurfaceKind::Notification)
}

#[cfg(test)]
#[path = "window_modes_tests.rs"]
mod tests;
