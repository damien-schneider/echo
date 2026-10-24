use super::layout::OverlayFrame;
use super::window::apply_absolute_overlay_frame;
use log::debug;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::WebviewWindow;

/// ω² of a critically damped spring — lands in about a quarter second and never overshoots the screen edge.
const GLIDE_STIFFNESS: f64 = 500.0;
const GLIDE_TICK: Duration = Duration::from_millis(8);
/// A late tick integrates in slices; one long step would fling the window past its dock.
const GLIDE_SLICE: f64 = 1.0 / 240.0;
const GLIDE_REST_DISTANCE: f64 = 0.5;
const GLIDE_REST_SPEED: f64 = 20.0;
/// A stalled main thread must not leave the island hanging mid-air.
const GLIDE_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct GlidePoint {
    pub(super) x: f64,
    pub(super) y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct GlideMotion {
    pub(super) position: GlidePoint,
    pub(super) velocity: GlidePoint,
}

pub(super) type OnLand = Box<dyn FnOnce() + Send>;

enum GlideSlot {
    Idle,
    Armed {
        dropped: OverlayFrame,
        on_land: OnLand,
    },
    Running {
        generation: u64,
        on_land: OnLand,
        target: GlidePoint,
    },
}

struct GlideState {
    generation: u64,
    slot: GlideSlot,
}

static GLIDE: Mutex<GlideState> = Mutex::new(GlideState {
    generation: 0,
    slot: GlideSlot::Idle,
});

enum FrameRoute {
    Apply,
    Launch { generation: u64, start: GlidePoint },
    Retarget,
}

enum Arrival {
    Landed(OnLand),
    Retargeted,
    Stopped,
}

fn with_glide<T>(update: impl FnOnce(&mut GlideState) -> T) -> T {
    match GLIDE.lock() {
        Ok(mut state) => update(&mut state),
        Err(poisoned) => update(&mut poisoned.into_inner()),
    }
}

fn origin(frame: OverlayFrame) -> GlidePoint {
    GlidePoint {
        x: frame.x,
        y: frame.y,
    }
}

/// A new orientation reshapes the window, so it reappears centred where the old one was let go.
pub(super) fn glide_start(dropped: OverlayFrame, landing: OverlayFrame) -> GlidePoint {
    if dropped.width == landing.width && dropped.height == landing.height {
        return origin(dropped);
    }
    GlidePoint {
        x: dropped.x + (dropped.width - landing.width) / 2.0,
        y: dropped.y + (dropped.height - landing.height) / 2.0,
    }
}

fn axis_step(position: f64, velocity: f64, target: f64, slice: f64) -> (f64, f64) {
    let damping = 2.0 * GLIDE_STIFFNESS.sqrt();
    let acceleration = GLIDE_STIFFNESS * (target - position) - damping * velocity;
    let next_velocity = velocity + acceleration * slice;
    (position + next_velocity * slice, next_velocity)
}

pub(super) fn advance(motion: GlideMotion, target: GlidePoint, elapsed: f64) -> GlideMotion {
    let mut remaining = elapsed.max(0.0);
    let mut next = motion;
    while remaining > 0.0 {
        let slice = remaining.min(GLIDE_SLICE);
        let (x, velocity_x) = axis_step(next.position.x, next.velocity.x, target.x, slice);
        let (y, velocity_y) = axis_step(next.position.y, next.velocity.y, target.y, slice);
        next = GlideMotion {
            position: GlidePoint { x, y },
            velocity: GlidePoint {
                x: velocity_x,
                y: velocity_y,
            },
        };
        remaining -= slice;
    }
    next
}

pub(super) fn is_at_rest(motion: GlideMotion, target: GlidePoint) -> bool {
    let distance = (target.x - motion.position.x).hypot(target.y - motion.position.y);
    let speed = motion.velocity.x.hypot(motion.velocity.y);
    distance < GLIDE_REST_DISTANCE && speed < GLIDE_REST_SPEED
}

/// The next HUD frame glides out of the drop position; `on_land` runs once the window arrives.
pub(super) fn arm(dropped: OverlayFrame, on_land: OnLand) {
    with_glide(|state| state.slot = GlideSlot::Armed { dropped, on_land });
}

/// No render launched the glide, so the island has already arrived wherever it is.
pub(super) fn disarm() {
    let unlaunched =
        with_glide(
            |state| match std::mem::replace(&mut state.slot, GlideSlot::Idle) {
                GlideSlot::Armed { on_land, .. } => Some(on_land),
                other => {
                    state.slot = other;
                    None
                }
            },
        );
    if let Some(on_land) = unlaunched {
        on_land();
    }
}

/// A fresh grab hands the window back to the pointer.
pub(super) fn stop() {
    with_glide(|state| {
        state.generation = state.generation.wrapping_add(1);
        state.slot = GlideSlot::Idle;
    });
}

fn route(frame: OverlayFrame) -> FrameRoute {
    with_glide(
        |state| match std::mem::replace(&mut state.slot, GlideSlot::Idle) {
            GlideSlot::Idle => FrameRoute::Apply,
            GlideSlot::Armed { dropped, on_land } => {
                state.generation = state.generation.wrapping_add(1);
                state.slot = GlideSlot::Running {
                    generation: state.generation,
                    on_land,
                    target: origin(frame),
                };
                FrameRoute::Launch {
                    generation: state.generation,
                    start: glide_start(dropped, frame),
                }
            }
            GlideSlot::Running {
                generation,
                on_land,
                ..
            } => {
                state.slot = GlideSlot::Running {
                    generation,
                    on_land,
                    target: origin(frame),
                };
                FrameRoute::Retarget
            }
        },
    )
}

/// Mid-glide frames only move the destination — the window keeps flying toward it.
pub(super) fn place_hud(window: &WebviewWindow, frame: OverlayFrame) -> Result<(), String> {
    match route(frame) {
        FrameRoute::Apply => apply_absolute_overlay_frame(window, frame),
        FrameRoute::Launch { generation, start } => {
            apply_absolute_overlay_frame(
                window,
                OverlayFrame {
                    x: start.x,
                    y: start.y,
                    ..frame
                },
            )?;
            let window = window.clone();
            thread::spawn(move || glide(&window, generation, start));
            Ok(())
        }
        FrameRoute::Retarget => window
            .set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: frame.width,
                height: frame.height,
            }))
            .map_err(|error| format!("Failed to resize overlay: {error}")),
    }
}

fn running_target(generation: u64) -> Option<GlidePoint> {
    with_glide(|state| match state.slot {
        GlideSlot::Running {
            generation: running,
            target,
            ..
        } if running == generation => Some(target),
        _ => None,
    })
}

/// A retarget can slip in between the last step and here — only an unchanged target ends the glide.
fn arrive(generation: u64, landed: GlidePoint) -> Arrival {
    with_glide(
        |state| match std::mem::replace(&mut state.slot, GlideSlot::Idle) {
            GlideSlot::Running {
                generation: running,
                on_land,
                target,
            } if running == generation => {
                if target == landed {
                    return Arrival::Landed(on_land);
                }
                state.slot = GlideSlot::Running {
                    generation: running,
                    on_land,
                    target,
                };
                Arrival::Retargeted
            }
            other => {
                state.slot = other;
                Arrival::Stopped
            }
        },
    )
}

fn glide(window: &WebviewWindow, generation: u64, start: GlidePoint) {
    let began = Instant::now();
    let mut last = began;
    let mut motion = GlideMotion {
        position: start,
        velocity: GlidePoint { x: 0.0, y: 0.0 },
    };
    loop {
        thread::sleep(GLIDE_TICK);
        let Some(target) = running_target(generation) else {
            return;
        };
        let now = Instant::now();
        motion = advance(motion, target, now.duration_since(last).as_secs_f64());
        last = now;
        let lands = is_at_rest(motion, target) || now.duration_since(began) >= GLIDE_TIMEOUT;
        let position = if lands { target } else { motion.position };
        if let Err(error) = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
            x: position.x,
            y: position.y,
        })) {
            debug!("[Overlay] Failed to glide the HUD: {error}");
        }
        if !lands {
            continue;
        }
        match arrive(generation, target) {
            Arrival::Landed(on_land) => return on_land(),
            Arrival::Retargeted => {}
            Arrival::Stopped => return,
        }
    }
}

#[cfg(test)]
#[path = "glide_tests.rs"]
mod tests;
