use super::{advance, glide_start, is_at_rest, GlideMotion, GlidePoint};
use crate::overlay::layout::OverlayFrame;

const FRAME: f64 = 1.0 / 120.0;

fn released_at(x: f64, y: f64) -> GlideMotion {
    GlideMotion {
        position: GlidePoint { x, y },
        velocity: GlidePoint { x: 0.0, y: 0.0 },
    }
}

fn frames_until_rest(mut motion: GlideMotion, dock: GlidePoint) -> (usize, Vec<GlidePoint>) {
    let mut path = vec![motion.position];
    for frame in 1..=600 {
        motion = advance(motion, dock, FRAME);
        path.push(motion.position);
        if is_at_rest(motion, dock) {
            return (frame, path);
        }
    }
    (usize::MAX, path)
}

#[test]
fn a_drop_across_the_screen_lands_within_half_a_second() {
    let dock = GlidePoint {
        x: 1392.0,
        y: 336.0,
    };
    let (frames, _) = frames_until_rest(released_at(200.0, 700.0), dock);
    assert!(frames <= 60, "glide took {frames} frames");
}

#[test]
fn the_glide_never_flies_past_its_dock() {
    let dock = GlidePoint { x: 1392.0, y: 20.0 };
    let (_, path) = frames_until_rest(released_at(300.0, 640.0), dock);
    assert!(path.iter().all(|point| point.x <= dock.x + 0.5));
    assert!(path.iter().all(|point| point.y >= dock.y - 0.5));
}

#[test]
fn the_glide_closes_in_on_its_dock_every_frame() {
    let dock = GlidePoint { x: 600.0, y: 852.0 };
    let (_, path) = frames_until_rest(released_at(1100.0, 400.0), dock);
    let distances: Vec<f64> = path
        .iter()
        .map(|point| (dock.x - point.x).hypot(dock.y - point.y))
        .collect();
    assert!(distances.windows(2).all(|pair| pair[1] <= pair[0]));
}

#[test]
fn a_stalled_tick_does_not_fling_the_window_past_its_dock() {
    let dock = GlidePoint { x: 0.0, y: 0.0 };
    let motion = advance(released_at(900.0, 0.0), dock, 0.5);
    assert!(motion.position.x >= -0.5 && motion.position.x < 900.0);
}

#[test]
fn a_same_shaped_window_glides_from_exactly_where_it_was_let_go() {
    let dropped = OverlayFrame {
        height: 236.0,
        width: 48.0,
        x: 700.0,
        y: 300.0,
    };
    let landing = OverlayFrame {
        x: 1392.0,
        y: 120.0,
        ..dropped
    };
    assert_eq!(
        glide_start(dropped, landing),
        GlidePoint { x: 700.0, y: 300.0 }
    );
}

#[test]
fn a_reshaped_window_reappears_centred_on_the_drop() {
    let dropped = OverlayFrame {
        height: 236.0,
        width: 48.0,
        x: 700.0,
        y: 300.0,
    };
    let landing = OverlayFrame {
        height: 48.0,
        width: 236.0,
        x: 602.0,
        y: 852.0,
    };
    let start = glide_start(dropped, landing);
    assert_eq!(
        start.x + landing.width / 2.0,
        dropped.x + dropped.width / 2.0
    );
    assert_eq!(
        start.y + landing.height / 2.0,
        dropped.y + dropped.height / 2.0
    );
}
