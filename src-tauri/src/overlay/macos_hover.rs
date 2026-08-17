use super::layout::{
    overlay_mode_accepts_keyboard, overlay_mode_is_resident, OverlaySurfaceKind,
    RecordingOverlayMode,
};
use super::surface::OverlayBoxPayload;
use super::window::{OVERLAY_NOTIFICATION_LABEL, RECORDING_OVERLAY_LABEL};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter};

pub(super) const OVERLAY_POINTER_BOUNDARY_EVENT: &str = "overlay-pointer-boundary";
const HOVER_EXIT_MARGIN: f64 = 2.0;

pub(super) static SYNTHETIC_KEY_SUPPRESSED: AtomicBool = AtomicBool::new(false);

/// Per-panel — the notification taking key for chat must not make the HUD think the pointer is on its handle.
pub(super) struct PanelHoverState {
    accepts_key: AtomicBool,
    hover_box: Mutex<Option<OverlayBoxPayload>>,
    is_resident: AtomicBool,
    label: &'static str,
    ns_window: AtomicUsize,
    pointer_inside: AtomicBool,
}

impl PanelHoverState {
    const fn new(label: &'static str, is_resident: bool) -> Self {
        Self {
            accepts_key: AtomicBool::new(false),
            hover_box: Mutex::new(None),
            is_resident: AtomicBool::new(is_resident),
            label,
            ns_window: AtomicUsize::new(0),
            pointer_inside: AtomicBool::new(false),
        }
    }

    pub(super) fn can_become_key_window(&self) -> bool {
        !SYNTHETIC_KEY_SUPPRESSED.load(Ordering::Acquire)
            && (self.accepts_key.load(Ordering::Acquire)
                || self.pointer_inside.load(Ordering::Acquire))
    }

    pub(super) fn accepts_key(&self) -> bool {
        self.accepts_key.load(Ordering::Acquire)
    }

    pub(super) fn set_key_policy(&self, mode: RecordingOverlayMode) {
        self.accepts_key
            .store(overlay_mode_accepts_keyboard(mode), Ordering::Release);
        self.is_resident
            .store(overlay_mode_is_resident(mode), Ordering::Release);
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

    pub(super) fn store_pointer_inside(&self, inside: bool) {
        self.pointer_inside.store(inside, Ordering::Release);
    }

    /// WebKit only reports moves once the pointer travels again, so the island rides this native boundary instead.
    pub(super) fn publish_pointer_boundary(&self, app_handle: &AppHandle, inside: bool) {
        if !self.is_resident.load(Ordering::Acquire) {
            return;
        }
        log::info!("[Overlay] pointer boundary: inside={inside}");
        let _ = app_handle.emit_to(self.label, OVERLAY_POINTER_BOUNDARY_EVENT, inside);
    }

    pub(super) fn pointer_left(&self, app_handle: &AppHandle) {
        if self.pointer_inside.swap(false, Ordering::AcqRel) {
            self.publish_pointer_boundary(app_handle, false);
        }
    }
}

static HUD_PANEL: PanelHoverState = PanelHoverState::new(RECORDING_OVERLAY_LABEL, true);
static NOTIFICATION_PANEL: PanelHoverState =
    PanelHoverState::new(OVERLAY_NOTIFICATION_LABEL, false);

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum HoverKeyAction {
    TakeKey,
    ReleaseKey,
    Stand,
}

#[derive(Clone, Copy)]
pub(super) struct HoverKeySample {
    pub(super) keyboard_mode: bool,
    pub(super) panel_is_key: bool,
    pub(super) synthetic_key_suppressed: bool,
    pub(super) pointer_inside: bool,
}

/// Stateless — a mode change drops key transiently, so possession is just re-taken while the pointer is inside.
pub(super) fn decide_hover_key(sample: HoverKeySample) -> HoverKeyAction {
    if sample.keyboard_mode {
        // Chat owns key deliberately, wherever the pointer goes.
        return HoverKeyAction::Stand;
    }
    if !sample.pointer_inside {
        if sample.panel_is_key {
            return HoverKeyAction::ReleaseKey;
        }
        return HoverKeyAction::Stand;
    }
    if sample.panel_is_key || sample.synthetic_key_suppressed {
        return HoverKeyAction::Stand;
    }
    HoverKeyAction::TakeKey
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
