use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::{json, Map, Value};

/// Without the dictation examples, a 4B model turns "il faut que je crée une note de frais" into a note.
const SYSTEM_PROMPT: &str = r#"You receive one speech transcription in the user message. Decide whether the speaker is telling the computer to perform one of the available tools right now.

A command speaks to the computer and asks it to act now, for example "Open Slack", "Lance Firefox", "Make a note titled ideas: try dark mode". For a command, call the matching tool once and write nothing else.

Everything else is not a command, even when it mentions opening something, notes or themes, for example "We should open the store earlier on Sundays" or "J'ai noté ses remarques dans le cahier". For anything that is not a command, call no tool and reply with the single word: none"#;

const CYCLE_FEEDBACK_SOUNDS: &str = "cycle_feedback_sounds";
const CREATE_NOTE: &str = "create_note";
const OPEN_APPLICATION: &str = "open_application";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum VoiceCommand {
    CycleFeedbackSounds,
    CreateNote { title: String, content: String },
    OpenApplication { app_name: String },
}

pub(super) fn request_body(transcript: &str) -> Value {
    json!({
        "model": "polish",
        "temperature": 0,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": transcript },
        ],
        "tools": [
            tool(
                CYCLE_FEEDBACK_SOUNDS,
                "Switch Echo's feedback sounds to the next sound theme, thème sonore (Marimba -> Custom -> Marimba).",
                &[],
            ),
            tool(
                CREATE_NOTE,
                "Create a text note file with the given title and content.",
                &[
                    ("content", "The text content of the note"),
                    ("title", "The title of the note (used as filename)"),
                ],
            ),
            tool(
                OPEN_APPLICATION,
                "Open an application by name on the user's system.",
                &[("app_name", "The name of the application to open")],
            ),
        ],
        "tool_choice": "auto",
    })
}

/// Every argument is a required string, in the schema shape the local server was already answering.
fn tool(name: &str, description: &str, arguments: &[(&str, &str)]) -> Value {
    let properties: Map<String, Value> = arguments
        .iter()
        .map(|(argument, meaning)| {
            (
                (*argument).to_string(),
                json!({ "type": "string", "description": meaning }),
            )
        })
        .collect();
    let mut parameters = json!({
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": properties,
        "additionalProperties": false,
    });
    if !arguments.is_empty() {
        let required: Vec<&str> = arguments.iter().map(|(argument, _)| *argument).collect();
        parameters["required"] = json!(required);
    }
    json!({
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": parameters,
        },
    })
}

#[derive(Deserialize)]
struct Completion {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Message,
}

#[derive(Deserialize)]
struct Message {
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Deserialize)]
struct ToolCall {
    function: FunctionCall,
}

#[derive(Deserialize)]
struct FunctionCall {
    name: String,
    arguments: String,
}

#[derive(Deserialize)]
struct NoteArguments {
    title: String,
    content: String,
}

#[derive(Deserialize)]
struct ApplicationArguments {
    app_name: String,
}

fn command_from(call: &FunctionCall) -> Option<VoiceCommand> {
    match call.name.as_str() {
        CYCLE_FEEDBACK_SOUNDS => Some(VoiceCommand::CycleFeedbackSounds),
        CREATE_NOTE => serde_json::from_str(&call.arguments)
            .ok()
            .map(|NoteArguments { title, content }| VoiceCommand::CreateNote { title, content }),
        OPEN_APPLICATION => serde_json::from_str(&call.arguments)
            .ok()
            .map(|ApplicationArguments { app_name }| VoiceCommand::OpenApplication { app_name }),
        _ => None,
    }
}

/// A repeated identical call would run twice, and cycling the sound theme twice lands elsewhere.
pub(super) fn commands_in(completion: &str) -> Result<Vec<VoiceCommand>> {
    let completion: Completion = serde_json::from_str(completion)
        .context("The local model's voice command answer is not a chat completion")?;
    let calls = completion
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message.tool_calls)
        .unwrap_or_default();
    let mut commands = Vec::new();
    for call in calls {
        match command_from(&call.function) {
            Some(command) if !commands.contains(&command) => commands.push(command),
            Some(_) => {}
            None => log::warn!(
                "Voice command skipped: '{}' was called with arguments Echo cannot use",
                call.function.name
            ),
        }
    }
    Ok(commands)
}

#[cfg(test)]
mod tests {
    use super::{commands_in, request_body, VoiceCommand};
    use serde_json::{json, Value};

    fn answer_calling(calls: Value) -> String {
        json!({
            "choices": [{
                "finish_reason": "tool_calls",
                "message": { "role": "assistant", "content": null, "tool_calls": calls },
            }],
        })
        .to_string()
    }

    fn call(name: &str, arguments: Value) -> Value {
        json!({
            "id": "call_1",
            "type": "function",
            "function": { "name": name, "arguments": arguments.to_string() },
        })
    }

    #[test]
    fn speech_the_model_judges_ordinary_runs_no_command() -> anyhow::Result<()> {
        let answer = json!({
            "choices": [{ "message": { "role": "assistant", "content": "none" } }],
        })
        .to_string();

        assert!(commands_in(&answer)?.is_empty());
        Ok(())
    }

    #[test]
    fn a_spoken_command_becomes_the_tool_the_model_called() -> anyhow::Result<()> {
        let answer = answer_calling(json!([
            call("open_application", json!({ "app_name": "Slack" })),
            call(
                "create_note",
                json!({ "title": "Ideas", "content": "try dark mode" })
            ),
            call("cycle_feedback_sounds", json!({})),
        ]));

        assert_eq!(
            commands_in(&answer)?,
            [
                VoiceCommand::OpenApplication {
                    app_name: "Slack".to_string()
                },
                VoiceCommand::CreateNote {
                    title: "Ideas".to_string(),
                    content: "try dark mode".to_string()
                },
                VoiceCommand::CycleFeedbackSounds,
            ]
        );
        Ok(())
    }

    #[test]
    fn a_call_the_model_got_wrong_is_skipped_and_the_right_one_still_runs() -> anyhow::Result<()> {
        let answer = answer_calling(json!([
            call("create_note", json!({ "title": "Ideas" })),
            call("delete_everything", json!({})),
            call("open_application", json!({ "app_name": "Slack" })),
        ]));

        assert_eq!(
            commands_in(&answer)?,
            [VoiceCommand::OpenApplication {
                app_name: "Slack".to_string()
            }]
        );
        Ok(())
    }

    #[test]
    fn the_same_call_made_twice_runs_once() -> anyhow::Result<()> {
        let answer = answer_calling(json!([
            call("cycle_feedback_sounds", json!({})),
            call("cycle_feedback_sounds", json!({})),
        ]));

        assert_eq!(commands_in(&answer)?, [VoiceCommand::CycleFeedbackSounds]);
        Ok(())
    }

    #[test]
    fn an_answer_that_is_not_a_completion_is_an_error() {
        assert!(commands_in("<html>502 Bad Gateway</html>").is_err());
    }

    #[test]
    fn every_tool_offered_to_the_model_is_one_echo_can_run() -> anyhow::Result<()> {
        let body = request_body("Open Slack");
        let offered = body["tools"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default();
        let calls: Vec<Value> = offered
            .iter()
            .map(|tool| {
                let function = &tool["function"];
                let arguments: serde_json::Map<String, Value> = function["parameters"]["required"]
                    .as_array()
                    .map(Vec::as_slice)
                    .unwrap_or_default()
                    .iter()
                    .filter_map(Value::as_str)
                    .map(|argument| (argument.to_string(), json!("x")))
                    .collect();
                call(
                    function["name"].as_str().unwrap_or_default(),
                    Value::Object(arguments),
                )
            })
            .collect();

        assert_eq!(offered.len(), 3);
        assert_eq!(commands_in(&answer_calling(Value::Array(calls)))?.len(), 3);
        Ok(())
    }
}
