use super::Combo;

fn stored(raw: &str) -> String {
    Combo::usable(raw).unwrap().to_string()
}

#[test]
fn keys_pressed_in_any_order_are_stored_modifiers_first() {
    assert_eq!(stored("space+ctrl"), "ctrl+space");
    assert_eq!(stored("A+Shift+Control"), "ctrl+shift+a");
}

#[test]
fn two_keys_are_refused() {
    assert!(Combo::usable("ctrl+a+b").is_err());
}

#[test]
fn modifiers_alone_are_refused() {
    assert!(Combo::usable("ctrl+shift").is_err());
}

#[test]
fn a_key_that_types_cannot_be_a_shortcut_on_its_own() {
    for combo in ["space", "a", "shift+a", "enter", "esc", "num5", "/"] {
        assert!(Combo::usable(combo).is_err(), "{combo} should be refused");
    }
}

#[test]
fn keys_that_do_not_type_can_stand_alone() {
    for combo in ["f5", "pageup", "insert", "numlock"] {
        assert!(Combo::usable(combo).is_ok(), "{combo} should be accepted");
    }
}

#[test]
fn a_typing_key_with_a_real_modifier_is_accepted() {
    assert_eq!(stored("ctrl+space"), "ctrl+space");
}

#[cfg(target_os = "macos")]
#[test]
fn fn_works_alone_or_as_a_modifier_on_macos() {
    assert_eq!(stored("fn"), "fn");
    assert_eq!(stored("space+fn"), "fn+space");
    assert_eq!(stored("fn+ctrl"), "fn+ctrl");
}

#[cfg(not(target_os = "macos"))]
#[test]
fn fn_is_refused_where_the_os_never_sees_it() {
    assert!(Combo::usable("fn").is_err());
}
