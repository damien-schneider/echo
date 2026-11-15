use super::*;
use serde_json::json;

fn a_store_from_before_the_prompt_library(legacy: serde_json::Value) -> serde_json::Value {
    let mut raw = serde_json::to_value(get_default_settings()).unwrap();
    let fields = raw.as_object_mut().unwrap();
    for key in ["prompts", "dictation_prompt", "polish_prompt", "chat_prompt"] {
        fields.remove(key);
    }
    for (key, value) in legacy.as_object().unwrap() {
        fields.insert(key.clone(), value.clone());
    }
    raw
}

fn legacy_default_prompt() -> serde_json::Value {
    json!({
        "id": "default_improve_transcriptions",
        "name": "Improve Transcriptions",
        "prompt": "Clean this transcript.\n\nTranscript:\n${output}"
    })
}

fn legacy_custom_prompt() -> serde_json::Value {
    json!({
        "id": "prompt_1700000000000",
        "name": "Formal",
        "prompt": "Make this formal: [output](mention:output)"
    })
}

fn custom_ids(settings: &AppSettings) -> Vec<&str> {
    settings
        .prompts
        .iter()
        .map(|prompt| prompt.id.as_str())
        .collect()
}

#[test]
fn a_fresh_install_starts_with_translate_and_no_dictation_rewrite() {
    let settings = get_default_settings();

    assert_eq!(custom_ids(&settings), vec![TRANSLATE_PROMPT_ID]);
    assert_eq!(settings.dictation_prompt, None);
    assert_eq!(
        settings.polish_prompt,
        PromptRef::Builtin(PolishLevel::Natural)
    );
    assert_eq!(settings.chat_prompt, None);
}

#[test]
fn prompt_refs_serialize_as_plain_ids() {
    assert_eq!(
        serde_json::to_value(PromptRef::Builtin(PolishLevel::Correct)).unwrap(),
        json!("correct")
    );
    assert_eq!(
        serde_json::to_value(PromptRef::Custom("prompt_1".into())).unwrap(),
        json!("prompt_1")
    );
    assert_eq!(
        serde_json::from_value::<PromptRef>(json!("clear")).unwrap(),
        PromptRef::Builtin(PolishLevel::Clear)
    );
    assert_eq!(
        serde_json::from_value::<PromptRef>(json!("translate")).unwrap(),
        PromptRef::Custom("translate".into())
    );
}

#[test]
fn dictation_rewrite_that_was_off_stays_off() {
    let raw = a_store_from_before_the_prompt_library(json!({
        "post_process_enabled": false,
        "post_process_prompts": [legacy_default_prompt()],
        "post_process_selected_prompt_id": "default_improve_transcriptions"
    }));

    let (settings, rewrite) = load_stored_settings(raw).unwrap();

    assert_eq!(settings.dictation_prompt, None);
    assert!(rewrite);
}

#[test]
fn the_default_dictation_cleanup_becomes_correct() {
    let raw = a_store_from_before_the_prompt_library(json!({
        "post_process_enabled": true,
        "post_process_prompts": [legacy_default_prompt()],
        "post_process_selected_prompt_id": "default_improve_transcriptions"
    }));

    let (settings, _) = load_stored_settings(raw).unwrap();

    assert_eq!(
        settings.dictation_prompt,
        Some(PromptRef::Builtin(PolishLevel::Correct))
    );
}

#[test]
fn a_selected_custom_prompt_keeps_running_on_dictation() {
    let raw = a_store_from_before_the_prompt_library(json!({
        "post_process_enabled": true,
        "post_process_prompts": [legacy_default_prompt(), legacy_custom_prompt()],
        "post_process_selected_prompt_id": "prompt_1700000000000"
    }));

    let (settings, _) = load_stored_settings(raw).unwrap();

    assert_eq!(
        settings.dictation_prompt,
        Some(PromptRef::Custom("prompt_1700000000000".into()))
    );
}

#[test]
fn custom_prompts_move_into_the_library_without_the_output_placeholder() {
    let raw = a_store_from_before_the_prompt_library(json!({
        "post_process_prompts": [legacy_default_prompt(), legacy_custom_prompt()]
    }));

    let (settings, _) = load_stored_settings(raw).unwrap();

    let formal = settings
        .prompts
        .iter()
        .find(|prompt| prompt.id == "prompt_1700000000000")
        .unwrap();
    assert_eq!(formal.name, "Formal");
    assert_eq!(formal.instruction, "Make this formal:");
    assert!(settings
        .prompts
        .iter()
        .all(|prompt| !prompt.instruction.contains("${output}")));
}

#[test]
fn the_old_default_prompt_is_dropped_and_translate_is_seeded() {
    let raw = a_store_from_before_the_prompt_library(json!({
        "post_process_prompts": [legacy_default_prompt(), legacy_custom_prompt()]
    }));

    let (settings, _) = load_stored_settings(raw).unwrap();

    assert_eq!(
        custom_ids(&settings),
        vec!["prompt_1700000000000", TRANSLATE_PROMPT_ID]
    );
}

#[test]
fn the_polish_level_becomes_the_polish_prompt() {
    let raw = a_store_from_before_the_prompt_library(json!({ "polish_level": "clear" }));

    let (settings, _) = load_stored_settings(raw).unwrap();

    assert_eq!(
        settings.polish_prompt,
        PromptRef::Builtin(PolishLevel::Clear)
    );
}

#[test]
fn a_migrated_store_is_rewritten_without_the_legacy_fields() {
    let raw = a_store_from_before_the_prompt_library(json!({
        "post_process_enabled": true,
        "post_process_prompts": [legacy_default_prompt()],
        "post_process_selected_prompt_id": "default_improve_transcriptions",
        "polish_level": "correct"
    }));

    let (settings, _) = load_stored_settings(raw).unwrap();
    let rewritten = serde_json::to_value(&settings).unwrap();

    for key in [
        "post_process_enabled",
        "post_process_prompts",
        "post_process_selected_prompt_id",
        "polish_level",
    ] {
        assert!(rewritten.get(key).is_none(), "{key} survived the rewrite");
    }
}

#[test]
fn a_chosen_dictation_prompt_survives_later_loads() {
    let mut settings = get_default_settings();
    settings.dictation_prompt = Some(PromptRef::Custom(TRANSLATE_PROMPT_ID.into()));
    let raw = serde_json::to_value(&settings).unwrap();

    let (loaded, rewrite) = load_stored_settings(raw).unwrap();

    assert_eq!(loaded.dictation_prompt, settings.dictation_prompt);
    assert!(!rewrite);
}

#[test]
fn a_deleted_translate_stays_deleted() {
    let mut settings = get_default_settings();
    settings.prompts.clear();
    let raw = serde_json::to_value(&settings).unwrap();

    let (loaded, _) = load_stored_settings(raw).unwrap();

    assert!(loaded.prompts.is_empty());
}

#[test]
fn deleting_a_prompt_returns_every_surface_using_it_to_its_default() {
    let mut settings = get_default_settings();
    let translate = PromptRef::Custom(TRANSLATE_PROMPT_ID.into());
    settings.dictation_prompt = Some(translate.clone());
    settings.polish_prompt = translate.clone();
    settings.chat_prompt = Some(translate);

    settings.delete_prompt(TRANSLATE_PROMPT_ID).unwrap();

    assert!(settings.prompts.is_empty());
    assert_eq!(settings.dictation_prompt, None);
    assert_eq!(
        settings.polish_prompt,
        PromptRef::Builtin(PolishLevel::Natural)
    );
    assert_eq!(settings.chat_prompt, None);
}

#[test]
fn deleting_a_prompt_leaves_surfaces_using_another_one_alone() {
    let mut settings = get_default_settings();
    settings.dictation_prompt = Some(PromptRef::Builtin(PolishLevel::Correct));

    settings.delete_prompt(TRANSLATE_PROMPT_ID).unwrap();

    assert_eq!(
        settings.dictation_prompt,
        Some(PromptRef::Builtin(PolishLevel::Correct))
    );
}

#[test]
fn a_surface_cannot_point_at_a_prompt_that_does_not_exist() {
    let settings = get_default_settings();

    assert!(settings
        .ensure_prompt_exists(&PromptRef::Custom("prompt_missing".into()))
        .is_err());
    assert!(settings
        .ensure_prompt_exists(&PromptRef::Builtin(PolishLevel::Clear))
        .is_ok());
}

#[test]
fn a_custom_prompt_resolves_to_its_instruction() {
    let settings = get_default_settings();

    let resolved = settings
        .resolve_prompt(&PromptRef::Custom(TRANSLATE_PROMPT_ID.into()))
        .unwrap();

    assert_eq!(resolved.name, "Translate");
    assert!(matches!(resolved.instruction, Instruction::Custom(_)));
}

#[test]
fn dictation_rewrite_is_off_until_a_prompt_is_chosen() {
    let settings = get_default_settings();

    assert_eq!(settings.dictation_rewrite_prompt(), None);
}

#[test]
fn dictation_rewrites_with_the_chosen_prompt_and_reports_its_name() {
    let mut settings = get_default_settings();
    settings.dictation_prompt = Some(PromptRef::Custom(TRANSLATE_PROMPT_ID.into()));

    let prompt = settings.dictation_rewrite_prompt().unwrap();

    assert_eq!(prompt.name, "Translate");
    assert!(matches!(prompt.instruction, Instruction::Custom(_)));
}

#[test]
fn a_dictation_prompt_that_no_longer_exists_pastes_the_raw_transcript() {
    let mut settings = get_default_settings();
    settings.dictation_prompt = Some(PromptRef::Custom("prompt_gone".into()));

    assert_eq!(settings.dictation_rewrite_prompt(), None);
}
