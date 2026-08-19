use super::layout::{overlay_mode_accepts_keyboard, OverlaySurfaceKind, RecordingOverlayMode};
use super::surface::OverlayBoxPayload;
use super::window::{OVERLAY_NOTIFICATION_LABEL, RECORDING_OVERLAY_LABEL};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter};

pub(super) const OVERLAY_POINTER_EVENT: &str = "overlay-pointer";
const HOVER_EXIT_MARGIN: f64 = 2.0;

pub(super) static SYNTHETIC_KEY_SUPPRESSED: AtomicBool = AtomicBool::new(false);

/// Window-local, top-left origin — the webview reads it as CSS pixels.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OverlayPointerEvent {
    pub(super) inside: bool,
    pub(super) x: f64,
    pub(super) y: f64,
}

/// Per-panel — the notification owning chat's keyboard must not make the HUD think the pointer is on its handle.
pub(super) struct PanelHoverState {
    accepts_key: AtomicBool,
    hover_box: Mutex<Option<OverlayBoxPayload>>,
    label: &'static str,
    ns_window: AtomicUsize,
    pointer_inside: AtomicBool,
}

impl PanelHoverState {
    const fn new(label: &'static str) -> Self {
        Self {
            accepts_key: AtomicBool::new(false),
            hover_box: Mutex::new(None),
            label,
            ns_window: AtomicUsize::new(0),
            pointer_inside: AtomicBool::new(false),
        }
    }

    /// Hover never asks for the keyboard: taking key activates Echo and strands the user's caret.
    pub(super) fn can_become_key_window(&self) -> bool {
        !SYNTHETIC_KEY_SUPPRESSED.load(Ordering::Acquire)
            && self.accepts_key.load(Ordering::Acquire)
    }

    pub(super) fn accepts_key(&self) -> bool {
        self.accepts_key.load(Ordering::Acquire)
    }

    pub(super) fn set_key_policy(&self, mode: RecordingOverlayMode) {
        self.accepts_key
            .store(overlay_mode_accepts_keyboard(mode), Ordering::Release);
    }

    pub(super) fn replace_hover_box(&self, island: OverlayBoxPayload) {
        match self.hover_box.lock() {
            Ok(mut state) => *state = Some(island),
            Err(poisoned) => *poisoned.into_inner() = Some(island),
        }
    }

    pub(super) fn hover_box(&self) -> Option<OverlayBoxPayload> {
        match self.hover_box.lock() {
            Ok(state) => *state,
            Err(poisoned) => **poisoned.get_ref(),
        }
    }

    pub(super) fn register_ns_window(&self, address: usize) {
        self.ns_window.store(address, Ordering::Release);
    }

    pub(super) fn ns_window(&self) -> Option<usize> {
        let address = self.ns_window.load(Ordering::Acquire);
        (address != 0).then_some(address)
    }

    pub(super) fn label(&self) -> &'static str {
        self.label
    }

    pub(super) fn pointer_inside(&self) -> bool {
        self.pointer_inside.load(Ordering::Acquire)
    }

    /// WebKit delivers no pointer moves to a window it does not own the keyboard for — this is the webview's only pointer.
    pub(super) fn publish_pointer(&self, app_handle: &AppHandle, event: OverlayPointerEvent) {
        if self.pointer_inside.swap(event.inside, Ordering::AcqRel) != event.inside {
            log::info!("[Overlay] pointer {}: inside={}", self.label, event.inside);
        }
        let _ = app_handle.emit_to(self.label, OVERLAY_POINTER_EVENT, event);
    }

    pub(super) fn pointer_left(&self, app_handle: &AppHandle) {
        if self.pointer_inside.load(Ordering::Acquire) {
            self.publish_pointer(
                app_handle,
                OverlayPointerEvent {
                    inside: false,
                    x: 0.0,
                    y: 0.0,
                },
            );
        }
    }
}

static HUD_PANEL: PanelHoverState = PanelHoverState::new(RECORDING_OVERLAY_LABEL);
static NOTIFICATION_PANEL: PanelHoverState = PanelHoverState::new(OVERLAY_NOTIFICATION_LABEL);

pub(super) const HOVER_PANELS: [&PanelHoverState; 2] = [&HUD_PANEL, &NOTIFICATION_PANEL];

pub(super) fn panel_hover_state(kind: OverlaySurfaceKind) -> &'static PanelHoverState {
    match kind {
        OverlaySurfaceKind::Hud => &HUD_PANEL,
        OverlaySurfaceKind::Notification => &NOTIFICATION_PANEL,
    }
}

pub(super) fn panel_hover_state_for_label(label: &str) -> Result<&'static PanelHoverState, String> {
    HOVER_PANELS
        .into_iter()
        .find(|panel| panel.label == label)
        .ok_or_else(|| format!("Unknown overlay panel: {label}"))
}

pub(super) fn hud_panel_can_become_key_window() -> bool {
    HUD_PANEL.can_become_key_window()
}

pub(super) fn notification_panel_can_become_key_window() -> bool {
    NOTIFICATION_PANEL.can_become_key_window()
}

/// AppKit origin is bottom-left, the island box top-left — the vertical axis flips here.
fn hover_region_in_screen(
    frame: (f64, f64, f64, f64),
    island: OverlayBoxPayload,
) -> (f64, f64, f64, f64) {
    let (frame_x, frame_y, _, frame_height) = frame;
    (
        frame_x + island.x,
        frame_y + frame_height - island.y - island.height,
        island.width,
        island.height,
    )
}

/// Same axis flip, for the point the webview hit-tests with.
pub(super) fn window_local_pointer(frame: (f64, f64, f64, f64), pointer: (f64, f64)) -> (f64, f64) {
    let (frame_x, frame_y, _, frame_height) = frame;
    (pointer.0 - frame_x, frame_y + frame_height - pointer.1)
}

pub(super) fn overlay_hover_region_for_pointer(
    frame: (f64, f64, f64, f64),
    is_visible: bool,
    island: Option<OverlayBoxPayload>,
) -> Option<(f64, f64, f64, f64)> {
    if !is_visible {
        return None;
    }
    Some(hover_region_in_screen(frame, island?))
}

/// Asymmetric hysteresis — entry needs the pointer inside, exit allows a margin.
pub(super) fn hover_pointer_inside(
    frame: (f64, f64, f64, f64),
    pointer: (f64, f64),
    was_inside: bool,
) -> bool {
    let margin = if was_inside { HOVER_EXIT_MARGIN } else { 0.0 };
    let (x, y, width, height) = frame;
    let (pointer_x, pointer_y) = pointer;
    pointer_x >= x - margin
        && pointer_x < x + width + margin
        && pointer_y >= y - margin
        && pointer_y < y + height + margin
}

#[cfg(test)]
#[path = "macos_hover_tests.rs"]
mod tests;
