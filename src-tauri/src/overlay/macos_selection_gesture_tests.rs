use super::{leaves_selection, Release};

const STILL_CLICK: Release = Release {
    travel: 0.0,
    click_count: 1,
    extends: false,
    moved_window: false,
};

#[test]
fn a_plain_click_leaves_no_selection_to_copy() {
    assert!(!leaves_selection(STILL_CLICK));
}

#[test]
fn a_hand_trembling_on_a_click_is_still_a_click() {
    assert!(!leaves_selection(Release {
        travel: 2.0,
        ..STILL_CLICK
    }));
}

#[test]
fn dragging_across_text_leaves_a_selection() {
    assert!(leaves_selection(Release {
        travel: 120.0,
        ..STILL_CLICK
    }));
}

#[test]
fn double_and_triple_clicks_select_a_word_and_a_line() {
    assert!(leaves_selection(Release {
        click_count: 2,
        ..STILL_CLICK
    }));
    assert!(leaves_selection(Release {
        click_count: 3,
        ..STILL_CLICK
    }));
}

#[test]
fn shift_click_extends_the_selection() {
    assert!(leaves_selection(Release {
        extends: true,
        ..STILL_CLICK
    }));
}

#[test]
fn moving_or_zooming_a_window_selects_nothing() {
    assert!(!leaves_selection(Release {
        travel: 300.0,
        moved_window: true,
        ..STILL_CLICK
    }));
    assert!(!leaves_selection(Release {
        click_count: 2,
        moved_window: true,
        ..STILL_CLICK
    }));
}
