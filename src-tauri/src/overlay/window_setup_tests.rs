use std::cell::Cell;

#[cfg(target_os = "macos")]
#[test]
fn native_panel_starts_focusable_for_webview_click_delivery() {
    assert!(super::initial_overlay_focusable());
}

#[test]
fn successful_native_configuration_keeps_the_overlay() {
    let destroyed = Cell::new(false);

    let result = super::configure_or_destroy_overlay(
        || Ok(()),
        || {
            destroyed.set(true);
            Ok(())
        },
    );

    assert_eq!(result, Ok(()));
    assert!(!destroyed.get());
}

#[test]
fn failed_native_configuration_destroys_the_hidden_overlay() {
    let destroy_count = Cell::new(0);

    let result = super::configure_or_destroy_overlay(
        || Err("panel conversion failed".to_string()),
        || {
            destroy_count.set(destroy_count.get() + 1);
            Ok(())
        },
    );

    assert_eq!(destroy_count.get(), 1);
    assert_eq!(result, Err("panel conversion failed".to_string()));
}

#[test]
fn native_configuration_reports_cleanup_failure() {
    let result = super::configure_or_destroy_overlay(
        || Err("panel conversion failed".to_string()),
        || Err("window destroy failed".to_string()),
    );

    assert_eq!(
        result,
        Err("panel conversion failed; cleanup also failed: window destroy failed".to_string())
    );
}
