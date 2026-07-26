use tauri_nspanel::CollectionBehavior;

#[test]
fn overlay_joins_regular_and_full_screen_spaces() {
    let expected = CollectionBehavior::new()
        .can_join_all_spaces()
        .full_screen_auxiliary();

    assert_eq!(super::overlay_collection_behavior(), expected);
}
