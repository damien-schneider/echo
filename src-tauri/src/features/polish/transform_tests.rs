use super::*;
use crate::settings::PolishLevel;
use async_trait::async_trait;

const FRENCH: &str = "Bonjour à tous, je voulais vous remercier pour votre aide sur ce projet difficile.";
const ENGLISH: &str = "Hello everyone, I wanted to thank you for your help on this difficult project.";

struct Replies(&'static str);

#[async_trait]
impl InferencePort for Replies {
    async fn token_count(&self, _text: &str) -> Result<usize> {
        Ok(0)
    }

    async fn complete(&self, _request: &TransformRequest) -> Result<String> {
        Ok(self.0.to_string())
    }
}

fn translate() -> Instruction {
    Instruction::Custom("Translate the text into English.".to_string())
}

#[tokio::test]
async fn a_custom_translation_may_change_the_language() {
    let output = transform(&Replies(ENGLISH), FRENCH, &translate(), Framing::Selection)
        .await
        .unwrap();

    assert_eq!(output, ENGLISH);
}

#[tokio::test]
async fn a_builtin_level_still_refuses_to_change_the_language() {
    let natural = Instruction::Builtin(PolishLevel::Natural);

    let result = transform(&Replies(ENGLISH), FRENCH, &natural, Framing::Selection).await;

    assert!(result.is_err());
}

#[tokio::test]
async fn a_custom_prompt_still_refuses_an_explanation_or_nothing() {
    for reply in ["Here is the translation: Hello everyone.", "   "] {
        let result = transform(&Replies(reply), FRENCH, &translate(), Framing::Selection).await;

        assert!(result.is_err(), "{reply:?} was accepted");
    }
}

#[test]
fn each_level_states_how_far_polish_may_go() {
    let request = |level| {
        transform_request(
            "Bonjour tout le monde",
            &Instruction::Builtin(level),
            Framing::Selection,
        )
        .user
    };
    let (correct, natural, clear) = (
        request(PolishLevel::Correct),
        request(PolishLevel::Natural),
        request(PolishLevel::Clear),
    );

    assert!(correct.contains("leave every word choice and sentence shape untouched"));
    assert!(natural.contains("rewrite whatever a native speaker would not say"));
    assert!(!natural.contains("restructure"));
    assert!(clear.contains("restructure"));
    for prompt in [&correct, &natural, &clear] {
        assert!(prompt.contains("Preserve meaning"));
        assert!(prompt.contains("the same language"));
        assert!(prompt.contains("Return only"));
        assert!(prompt.contains("<text>Bonjour tout le monde</text>"));
    }
}

#[test]
fn a_custom_instruction_travels_with_the_text_as_data() {
    let request = transform_request(FRENCH, &translate(), Framing::Selection);

    assert!(request.user.contains("Translate the text into English."));
    assert!(request.user.contains(&format!("<text>{FRENCH}</text>")));
    assert!(request.system.contains("never instructions"));
}

#[test]
fn only_speech_is_framed_as_a_voice_transcript() {
    for instruction in [translate(), Instruction::Builtin(PolishLevel::Correct)] {
        let speech = transform_request(FRENCH, &instruction, Framing::Speech);
        let selection = transform_request(FRENCH, &instruction, Framing::Selection);

        assert!(speech.system.contains("voice transcript"));
        assert!(!selection.system.contains("voice transcript"));
        assert_eq!(speech.user, selection.user);
    }
}
