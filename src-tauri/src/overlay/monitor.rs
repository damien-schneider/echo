use super::layout::MonitorBounds;
#[cfg(target_os = "macos")]
use core_graphics::{
    event::CGEvent,
    event_source::{CGEventSource, CGEventSourceStateID},
};
#[cfg(target_os = "windows")]
use enigo::{Enigo, Mouse};
#[cfg(target_os = "linux")]
use log::error;
#[cfg(target_os = "linux")]
use log::warn;
#[cfg(target_os = "macos")]
use objc2_app_kit::NSScreen;
#[cfg(target_os = "macos")]
use objc2_foundation::{MainThreadMarker, NSObjectProtocol};
use tauri::AppHandle;

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OverlayNotchGeometry {
    pub(crate) center_offset: f64,
    pub(crate) top_inset: f64,
    pub(crate) width: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct OverlayScreen {
    pub(super) bounds: MonitorBounds,
    pub(super) notch: Option<OverlayNotchGeometry>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct NotchCacheKey {
    bounds: [u64; 4],
    name: Option<String>,
}

/// Notch probing walks every NSScreen on the main thread; the answer only
/// changes when the display arrangement does, so key the cache on identity.
static NOTCH_CACHE: std::sync::Mutex<Option<(NotchCacheKey, Option<OverlayNotchGeometry>)>> =
    std::sync::Mutex::new(None);

fn notch_cache_key(bounds: MonitorBounds, name: Option<String>) -> NotchCacheKey {
    NotchCacheKey {
        bounds: [
            bounds.x.to_bits(),
            bounds.y.to_bits(),
            bounds.width.to_bits(),
            bounds.height.to_bits(),
        ],
        name,
    }
}

fn cached_notch(key: &NotchCacheKey) -> Option<Option<OverlayNotchGeometry>> {
    let cache = match NOTCH_CACHE.lock() {
        Ok(cache) => cache,
        Err(poisoned) => poisoned.into_inner(),
    };
    cache
        .as_ref()
        .and_then(|(cached_key, notch)| (cached_key == key).then_some(*notch))
}

fn store_notch(key: NotchCacheKey, notch: Option<OverlayNotchGeometry>) {
    match NOTCH_CACHE.lock() {
        Ok(mut cache) => *cache = Some((key, notch)),
        Err(poisoned) => *poisoned.into_inner() = Some((key, notch)),
    }
}

#[cfg(target_os = "linux")]
pub(super) fn get_monitor_with_cursor(app_handle: &AppHandle) -> Option<tauri::Monitor> {
    if let Ok(Some(monitor)) = app_handle.primary_monitor() {
        return Some(monitor);
    }

    if let Ok(monitors) = app_handle.available_monitors() {
        if let Some(first) = monitors.first() {
            warn!(
                "[Overlay] Primary monitor detection failed, using first available monitor: {:?}",
                first.name()
            );
            return Some(first.clone());
        }
    }

    error!("[Overlay] CRITICAL: No monitors detected!");
    None
}

#[cfg(target_os = "linux")]
pub(super) fn cursor_position() -> Option<(f64, f64)> {
    None
}

#[cfg(not(target_os = "linux"))]
pub(super) fn cursor_position() -> Option<(f64, f64)> {
    #[cfg(target_os = "macos")]
    return macos_cursor_location();
    #[cfg(not(target_os = "macos"))]
    Enigo::new(&Default::default())
        .ok()?
        .location()
        .ok()
        .map(|(x, y)| (f64::from(x), f64::from(y)))
}

#[cfg(not(target_os = "linux"))]
pub(super) fn get_monitor_with_cursor(app_handle: &AppHandle) -> Option<tauri::Monitor> {
    cursor_position()
        .and_then(|mouse_location| {
            app_handle
                .monitor_from_point(mouse_location.0, mouse_location.1)
                .ok()
                .flatten()
        })
        .or_else(|| app_handle.primary_monitor().ok().flatten())
}

#[cfg(target_os = "macos")]
fn macos_cursor_location() -> Option<(f64, f64)> {
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
    let point = CGEvent::new(source).ok()?.location();
    validated_quartz_cursor_location((point.x, point.y))
}

#[cfg(target_os = "macos")]
fn validated_quartz_cursor_location(point: (f64, f64)) -> Option<(f64, f64)> {
    (point.0.is_finite() && point.1.is_finite()).then_some(point)
}

pub(super) fn logical_monitor_bounds(monitor: &tauri::Monitor) -> MonitorBounds {
    let position_on_screen = monitor.position();
    let size = monitor.size();
    let scale = monitor.scale_factor();
    MonitorBounds {
        x: f64::from(position_on_screen.x) / scale,
        y: f64::from(position_on_screen.y) / scale,
        width: f64::from(size.width) / scale,
        height: f64::from(size.height) / scale,
    }
}

#[cfg(target_os = "macos")]
#[derive(Clone)]
struct MacMonitorIdentity {
    bounds: MonitorBounds,
    name: Option<String>,
}

#[cfg(target_os = "macos")]
fn notch_geometry_from_regions(
    screen: (f64, f64, f64, f64),
    safe_top_inset: f64,
    left_area: (f64, f64, f64, f64),
    right_area: (f64, f64, f64, f64),
) -> Option<OverlayNotchGeometry> {
    let notch_left = left_area.0 + left_area.2;
    let notch_right = right_area.0;
    let width = notch_right - notch_left;
    if !(safe_top_inset.is_finite()
        && safe_top_inset > 0.0
        && width.is_finite()
        && width > 0.0
        && left_area.3 > 0.0
        && right_area.3 > 0.0)
    {
        return None;
    }
    let screen_center = screen.0 + screen.2 / 2.0;
    let notch_center = notch_left + width / 2.0;
    Some(OverlayNotchGeometry {
        center_offset: notch_center - screen_center,
        top_inset: safe_top_inset,
        width,
    })
}

#[cfg(target_os = "macos")]
fn screen_match_score(
    frame: (f64, f64, f64, f64),
    localized_name: &str,
    primary_height: f64,
    identity: &MacMonitorIdentity,
) -> f64 {
    let converted_y = primary_height - frame.1 - frame.3;
    let bounds = identity.bounds;
    let geometry_delta = (frame.0 - bounds.x).abs()
        + (converted_y - bounds.y).abs()
        + (frame.2 - bounds.width).abs()
        + (frame.3 - bounds.height).abs();
    let name_penalty = match &identity.name {
        Some(name) if name == localized_name => 0.0,
        Some(_) => 1_000_000.0,
        None => 0.0,
    };
    name_penalty + geometry_delta
}

#[cfg(target_os = "macos")]
fn resolve_macos_notch(
    mtm: MainThreadMarker,
    identity: &MacMonitorIdentity,
) -> Option<OverlayNotchGeometry> {
    let screens = NSScreen::screens(mtm);
    let primary_height = screens
        .iter()
        .map(|screen| screen.frame())
        .find(|frame| frame.origin.x == 0.0 && frame.origin.y == 0.0)?
        .size
        .height;
    let screen = screens.iter().min_by(|left, right| {
        let left_frame = left.frame();
        let right_frame = right.frame();
        let left_score = screen_match_score(
            (
                left_frame.origin.x,
                left_frame.origin.y,
                left_frame.size.width,
                left_frame.size.height,
            ),
            &left.localizedName().to_string(),
            primary_height,
            identity,
        );
        let right_score = screen_match_score(
            (
                right_frame.origin.x,
                right_frame.origin.y,
                right_frame.size.width,
                right_frame.size.height,
            ),
            &right.localizedName().to_string(),
            primary_height,
            identity,
        );
        left_score.total_cmp(&right_score)
    })?;
    if !(screen.respondsToSelector(objc2::sel!(safeAreaInsets))
        && screen.respondsToSelector(objc2::sel!(auxiliaryTopLeftArea))
        && screen.respondsToSelector(objc2::sel!(auxiliaryTopRightArea)))
    {
        return None;
    }
    let frame = screen.frame();
    let safe_area = screen.safeAreaInsets();
    let left_area = screen.auxiliaryTopLeftArea();
    let right_area = screen.auxiliaryTopRightArea();
    notch_geometry_from_regions(
        (
            frame.origin.x,
            frame.origin.y,
            frame.size.width,
            frame.size.height,
        ),
        safe_area.top,
        (
            left_area.origin.x,
            left_area.origin.y,
            left_area.size.width,
            left_area.size.height,
        ),
        (
            right_area.origin.x,
            right_area.origin.y,
            right_area.size.width,
            right_area.size.height,
        ),
    )
}

#[cfg(target_os = "macos")]
fn monitor_notch_geometry(
    app_handle: &AppHandle,
    monitor: &tauri::Monitor,
) -> Option<OverlayNotchGeometry> {
    let identity = MacMonitorIdentity {
        bounds: logical_monitor_bounds(monitor),
        name: monitor.name().cloned(),
    };
    if let Some(mtm) = MainThreadMarker::new() {
        return resolve_macos_notch(mtm, &identity);
    }
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app_handle
        .run_on_main_thread(move || {
            let notch = MainThreadMarker::new().and_then(|mtm| resolve_macos_notch(mtm, &identity));
            let _ = sender.send(notch);
        })
        .ok()?;
    receiver
        .recv_timeout(std::time::Duration::from_millis(500))
        .ok()
        .flatten()
}

#[cfg(not(target_os = "macos"))]
fn monitor_notch_geometry(
    _app_handle: &AppHandle,
    _monitor: &tauri::Monitor,
) -> Option<OverlayNotchGeometry> {
    None
}

pub(super) fn overlay_screen(app_handle: &AppHandle) -> Option<OverlayScreen> {
    let monitor = get_monitor_with_cursor(app_handle)?;
    let bounds = logical_monitor_bounds(&monitor);
    let key = notch_cache_key(bounds, monitor.name().cloned());
    if let Some(notch) = cached_notch(&key) {
        return Some(OverlayScreen { bounds, notch });
    }
    let notch = monitor_notch_geometry(app_handle, &monitor);
    store_notch(key, notch);
    Some(OverlayScreen { bounds, notch })
}

#[cfg(test)]
#[path = "monitor_tests.rs"]
mod tests;
