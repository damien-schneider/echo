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
        .context("Polish server returned no text")?;
    Ok(content.to_string())
}

#[derive(Deserialize)]
struct ChatStreamChunk {
    choices: Vec<ChatStreamChoice>,
}

#[derive(Deserialize)]
struct ChatStreamChoice {
    delta: ChatStreamDelta,
}

#[derive(Deserialize)]
struct ChatStreamDelta {
    content: Option<String>,
}

fn streamed_line_text(line: &str) -> Result<String> {
    let Some(payload) = line.strip_prefix("data:") else {
        return Ok(String::new());
    };
    let payload = payload.trim();
    if payload.is_empty() || payload == "[DONE]" {
        return Ok(String::new());
    }
    let chunk: ChatStreamChunk =
        serde_json::from_str(payload).context("Polish server streamed malformed JSON")?;
    Ok(chunk
        .choices
        .first()
        .and_then(|choice| choice.delta.content.clone())
        .unwrap_or_default())
}

/// Server-sent events arrive split anywhere, so only whole lines are decoded.
#[derive(Default)]
pub(super) struct ChatStreamDecoder {
    buffer: Vec<u8>,
}

impl ChatStreamDecoder {
    pub(super) fn push(&mut self, chunk: &[u8]) -> Result<String> {
        self.buffer.extend_from_slice(chunk);
        let mut text = String::new();
        while let Some(end) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=end).collect();
            let line = std::str::from_utf8(&line)
                .context("Polish server streamed invalid UTF-8")?
                .trim()
                .to_owned();
            text.push_str(&streamed_line_text(&line)?);
        }
        Ok(text)
    }
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
    pub(super) messages: &'a [ChatRequestMessage<'a>],
    pub(super) stream: bool,
    pub(super) temperature: f32,
    pub(super) seed: u64,
    pub(super) max_tokens: usize,
}

#[derive(Serialize)]
pub(super) struct ChatRequestMessage<'a> {
    pub(super) role: &'a str,
    pub(super) content: &'a str,
}

#[cfg(test)]
mod tests {
    use super::ChatStreamDecoder;

    fn delta(content: &str) -> String {
        format!("data: {{\"choices\":[{{\"delta\":{{\"content\":\"{content}\"}}}}]}}\n\n")
    }

    #[test]
    fn decodes_text_across_chunk_boundaries() {
        let mut decoder = ChatStreamDecoder::default();
        let stream = format!("{}{}data: [DONE]\n", delta("Hel"), delta("lo"));
        let (head, tail) = stream.split_at(stream.len() / 3);

        let first = decoder.push(head.as_bytes()).unwrap();
        let second = decoder.push(tail.as_bytes()).unwrap();

        assert_eq!(format!("{first}{second}"), "Hello");
    }

    #[test]
    fn decodes_multibyte_text_split_mid_character() {
        let mut decoder = ChatStreamDecoder::default();
        let line = delta("é");
        let split = line.find('é').unwrap() + 1;

        let first = decoder.push(&line.as_bytes()[..split]).unwrap();
        let second = decoder.push(&line.as_bytes()[split..]).unwrap();

        assert_eq!(format!("{first}{second}"), "é");
    }

    #[test]
    fn ignores_keep_alive_and_role_only_events() {
        let mut decoder = ChatStreamDecoder::default();

        let text = decoder
            .push(
                br#": ping

data: {"choices":[{"delta":{"role":"assistant"}}]}

"#,
            )
            .unwrap();

        assert_eq!(text, "");
    }

    #[test]
    fn reports_a_malformed_event_instead_of_dropping_it() {
        let mut decoder = ChatStreamDecoder::default();

        let error = decoder
            .push(
                br#"data: {"error":"overloaded"}

"#,
            )
            .unwrap_err();

        assert!(error.to_string().contains("malformed JSON"));
    }
}
