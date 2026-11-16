use anyhow::{bail, Context, Result};
use serde::Serialize;

use super::platform::DirectSelection;
use super::runtime::PolishRuntime;
use super::BundledChatMessage;

const CHAT_TOO_LONG: &str =
    "This conversation is too long for the local model. Start a new chat with a shorter message or selection.";

/// Half the input budget: the rest carries the instructions and the conversation.
fn max_chat_context_characters() -> usize {
    PolishRuntime::input_char_budget() / 2
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ChatContextSource {
    Clipboard,
    Selection,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct ChatTextContext {
    pub(crate) source: ChatContextSource,
    pub(crate) truncated: bool,
    pub(crate) text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ChatContextCapture {
    PermissionRequired,
    Ready(Option<ChatTextContext>),
}

pub(super) fn chat_text_context(text: String, source: ChatContextSource) -> ChatTextContext {
    let (text, truncated) = clipped_chat_text(text);
    ChatTextContext {
        source,
        text,
        truncated,
    }
}

fn clipped_chat_text(text: String) -> (String, bool) {
    let Some((byte_index, _)) = text.char_indices().nth(max_chat_context_characters()) else {
        return (text, false);
    };
    (text[..byte_index].to_owned(), true)
}

pub(super) fn chat_request_turns<'a>(
    system: &str,
    messages: &'a [BundledChatMessage],
) -> Result<&'a [BundledChatMessage]> {
    if system.trim().is_empty() {
        bail!("Chat request is empty");
    }
    chat_turns_within_budget(system, messages, PolishRuntime::input_char_budget())
}

/// Keeps the newest turns that fit; llama.cpp would drop the system prompt unannounced.
fn chat_turns_within_budget<'a>(
    system: &str,
    messages: &'a [BundledChatMessage],
    budget: usize,
) -> Result<&'a [BundledChatMessage]> {
    let (latest, earlier) = messages.split_last().context("Chat request is empty")?;
    let mut remaining = budget
        .checked_sub(system.chars().count() + latest.content.chars().count())
        .context(CHAT_TOO_LONG)?;
    let mut first_kept = earlier.len();
    for (index, message) in earlier.iter().enumerate().rev() {
        let Some(left) = remaining.checked_sub(message.content.chars().count()) else {
            break;
        };
        remaining = left;
        first_kept = index;
    }
    Ok(&messages[first_kept..])
}

/// What the chat panel shows, and whether accessibility is the source it can trust to update it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ShownChatContext {
    pub(crate) capture: ChatContextCapture,
    read_by_accessibility: bool,
}

impl ShownChatContext {
    pub(crate) fn read_by_accessibility(capture: ChatContextCapture) -> Self {
        Self {
            capture,
            read_by_accessibility: true,
        }
    }

    pub(crate) fn read_by_copy(capture: ChatContextCapture) -> Self {
        Self {
            capture,
            read_by_accessibility: false,
        }
    }

    /// An empty read only clears text accessibility produced itself; returns whether the panel changed.
    pub(crate) fn absorb(&mut self, observed: DirectSelection) -> bool {
        let next = match observed {
            DirectSelection::Unavailable => return false,
            DirectSelection::Empty if !self.read_by_accessibility => return false,
            DirectSelection::Empty => ChatContextCapture::Ready(None),
            DirectSelection::PermissionRequired => ChatContextCapture::PermissionRequired,
            DirectSelection::Text(text) => ChatContextCapture::Ready(Some(chat_text_context(
                text,
                ChatContextSource::Selection,
            ))),
        };
        self.read_by_accessibility = true;
        if next == self.capture {
            return false;
        }
        self.capture = next;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::polish::BundledChatRole;

    fn selected(text: &str) -> ChatContextCapture {
        ChatContextCapture::Ready(Some(chat_text_context(
            text.to_owned(),
            ChatContextSource::Selection,
        )))
    }

    fn turn(role: BundledChatRole, content: &str) -> BundledChatMessage {
        BundledChatMessage {
            content: content.to_owned(),
            role,
        }
    }

    #[test]
    fn clips_chat_context_on_character_boundaries() {
        let (short, short_was_clipped) = clipped_chat_text("short".to_string());
        assert_eq!(short, "short");
        assert!(!short_was_clipped);

        let (long, long_was_clipped) =
            clipped_chat_text("é".repeat(max_chat_context_characters() + 1));
        assert_eq!(long.chars().count(), max_chat_context_characters());
        assert!(long_was_clipped);
    }

    #[test]
    fn a_selection_as_large_as_the_context_still_leaves_room_to_ask_about_it() {
        let budget = PolishRuntime::input_char_budget();
        let reference = chat_text_context("é".repeat(budget), ChatContextSource::Selection);
        let question = [turn(BundledChatRole::User, "What does this mean?")];

        assert!(reference.truncated);
        assert_eq!(
            chat_turns_within_budget(&reference.text, &question, budget).unwrap(),
            &question[..]
        );
    }

    #[test]
    fn a_conversation_within_budget_is_sent_whole() {
        let messages = [
            turn(BundledChatRole::User, "first question"),
            turn(BundledChatRole::Assistant, "first answer"),
            turn(BundledChatRole::User, "latest question"),
        ];

        assert_eq!(
            chat_turns_within_budget("system", &messages, 100).unwrap(),
            &messages[..]
        );
    }

    #[test]
    fn a_conversation_over_budget_drops_its_oldest_turns_and_keeps_the_latest() {
        let messages = [
            turn(BundledChatRole::User, "first question"),
            turn(BundledChatRole::Assistant, "first answer"),
            turn(BundledChatRole::User, "second question"),
            turn(BundledChatRole::Assistant, "second answer"),
            turn(BundledChatRole::User, "latest question"),
        ];

        assert_eq!(
            chat_turns_within_budget("system", &messages, 50).unwrap(),
            &messages[2..]
        );
    }

    #[test]
    fn a_latest_turn_that_cannot_fit_is_refused_with_a_way_out() {
        let messages = [
            turn(BundledChatRole::User, "earlier question"),
            turn(BundledChatRole::User, &"é".repeat(40)),
        ];

        let refusal = chat_turns_within_budget("system", &messages, 40).unwrap_err();

        assert_eq!(refusal.to_string(), CHAT_TOO_LONG);
    }

    #[test]
    fn a_request_without_a_question_is_refused() {
        assert!(chat_turns_within_budget("system", &[], 100).is_err());
        assert!(chat_request_turns("  ", &[turn(BundledChatRole::User, "Hi")]).is_err());
    }

    #[test]
    fn an_empty_read_never_clears_text_the_copy_shortcut_found() {
        let mut shown = ShownChatContext::read_by_copy(selected("Slack thread"));

        assert!(!shown.absorb(DirectSelection::Empty));
        assert!(!shown.absorb(DirectSelection::Unavailable));
        assert_eq!(shown.capture, selected("Slack thread"));
    }

    #[test]
    fn accessibility_clears_only_the_text_it_read_itself() {
        let mut shown = ShownChatContext::read_by_copy(selected("Slack thread"));

        assert!(shown.absorb(DirectSelection::Text("hello".to_owned())));
        assert!(shown.absorb(DirectSelection::Empty));
        assert_eq!(shown.capture, ChatContextCapture::Ready(None));
    }
}
