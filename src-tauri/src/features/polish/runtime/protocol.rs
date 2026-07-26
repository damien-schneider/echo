use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: String,
}

pub(super) fn parse_chat_response(body: &str) -> Result<String> {
    let response: ChatResponse =
        serde_json::from_str(body).context("Polish server returned malformed JSON")?;
    let content = response
        .choices
        .first()
        .map(|choice| choice.message.content.trim())
        .filter(|content| !content.is_empty())
        .context("Polish server returned no corrected text")?;
    Ok(content.to_string())
}

#[derive(Deserialize)]
pub(super) struct TokenizeResponse {
    pub(super) tokens: Vec<u32>,
}

#[derive(Serialize)]
pub(super) struct TokenizeRequest<'a> {
    pub(super) content: &'a str,
    pub(super) add_special: bool,
}

#[derive(Serialize)]
pub(super) struct ChatRequest<'a> {
    pub(super) model: &'static str,
    pub(super) messages: [ChatRequestMessage<'a>; 2],
    pub(super) stream: bool,
    pub(super) temperature: f32,
    pub(super) seed: u64,
    pub(super) max_tokens: usize,
}

#[derive(Serialize)]
pub(super) struct ChatRequestMessage<'a> {
    pub(super) role: &'static str,
    pub(super) content: &'a str,
}
