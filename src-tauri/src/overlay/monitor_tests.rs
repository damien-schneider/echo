#[cfg(target_os = "macos")]
#[test]
fn native_cursor_location_is_available_without_accessibility() {
    assert!(super::macos_cursor_location().is_some());
}

#[cfg(target_os = "macos")]
#[test]
fn quartz_cursor_coordinates_keep_fractional_and_negative_positions() {
    assert_eq!(
        super::validated_quartz_cursor_location((120.5, -198.25)),
        Some((120.5, -198.25))
    );
    assert_eq!(
        super::validated_quartz_cursor_location((f64::NAN, 10.0)),
        None
    );
}

#[cfg(target_os = "macos")]
#[test]
fn derives_notch_width_and_center_from_safe_screen_regions() {
    let notch = super::notch_geometry_from_regions(
        (0.0, 0.0, 1512.0, 982.0),
        32.0,
        (0.0, 950.0, 658.0, 32.0),
        (854.0, 950.0, 658.0, 32.0),
    );

    assert_eq!(
        notch,
        Some(super::OverlayNotchGeometry {
            center_offset: 0.0,
            top_inset: 32.0,
            width: 196.0,
        })
    );
}

#[cfg(target_os = "macos")]
#[test]
fn external_screen_without_safe_top_inset_has_no_notch() {
    assert_eq!(
        super::notch_geometry_from_regions(
            (0.0, 0.0, 1920.0, 1080.0),
            0.0,
            (0.0, 1056.0, 960.0, 24.0),
            (960.0, 1056.0, 960.0, 24.0),
        ),
        None
    );
}

#[test]
fn notch_cache_answers_only_for_the_same_screen_identity() {
    let bounds = super::MonitorBounds {
        height: 982.0,
        width: 1512.0,
        x: 0.0,
        y: 0.0,
    };
    let key = super::notch_cache_key(bounds, Some("Built-in Retina Display".to_string()));
    let notch = Some(super::OverlayNotchGeometry {
        center_offset: 0.0,
        top_inset: 32.0,
        width: 196.0,
    });
    super::store_notch(key.clone(), notch);

    assert_eq!(super::cached_notch(&key), Some(notch));
    assert_eq!(
        super::cached_notch(&super::notch_cache_key(bounds, Some("Studio".to_string()))),
        None
    );
    assert_eq!(
        super::cached_notch(&super::notch_cache_key(
            super::MonitorBounds {
                x: -1512.0,
                ..bounds
            },
            Some("Built-in Retina Display".to_string()),
        )),
        None
    );
}
