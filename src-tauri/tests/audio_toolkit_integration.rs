use echo_app_lib::audio_toolkit::apply_custom_words;

#[test]
fn passthrough_when_no_custom_words() {
    let input = "Hello world";
    assert_eq!(apply_custom_words(input, &[], 0.3), input);
}

#[test]
fn corrects_close_misspelling() {
    let custom = vec!["Tauri".to_string()];
    let result = apply_custom_words("I love Taurii framework", &custom, 0.4);
    assert!(
        result.contains("Tauri"),
        "expected correction, got: {}",
        result
    );
}

#[test]
fn leaves_unrelated_words_alone() {
    let custom = vec!["Anthropic".to_string()];
    let result = apply_custom_words("the cat sat on the mat", &custom, 0.3);
    assert_eq!(result, "the cat sat on the mat");
}
