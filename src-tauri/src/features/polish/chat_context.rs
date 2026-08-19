use serde::Serialize;

use super::platform::DirectSelection;

const MAX_CHAT_CONTEXT_CHARACTERS: usize = 20_000;

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
    let Some((byte_index, _)) = text.char_indices().nth(MAX_CHAT_CONTEXT_CHARACTERS) else {
        return (text, false);
    };
    (text[..byte_index].to_owned(), true)
}

/// Accessibility proves a selection but never its absence: a focused composer answers "nothing" while the page around it is highlighted.
pub(super) fn capture_settled_by_accessibility(
    observed: DirectSelection,
) -> Option<ChatContextCapture> {
    match observed {
        DirectSelection::PermissionRequired => Some(ChatContextCapture::PermissionRequired),
        DirectSelection::Text(text) => Some(ChatContextCapture::Ready(Some(chat_text_context(
            text,
            ChatContextSource::Selection,
        )))),
        DirectSelection::Empty | DirectSelection::Unavailable => None,
    }
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

    fn selected(text: &str) -> ChatContextCapture {
        ChatContextCapture::Ready(Some(chat_text_context(
            text.to_owned(),
            ChatContextSource::Selection,
        )))
    }

    #[test]
    fn clips_chat_context_on_character_boundaries() {
        let (short, short_was_clipped) = clipped_chat_text("short".to_string());
        assert_eq!(short, "short");
        assert!(!short_was_clipped);

        let (long, long_was_clipped) =
            clipped_chat_text("é".repeat(MAX_CHAT_CONTEXT_CHARACTERS + 1));
        assert_eq!(long.chars().count(), MAX_CHAT_CONTEXT_CHARACTERS);
        assert!(long_was_clipped);
    }

    #[test]
    fn an_empty_accessibility_read_leaves_the_capture_to_the_copy_shortcut() {
        assert_eq!(
            capture_settled_by_accessibility(DirectSelection::Empty),
            None
        );
        assert_eq!(
            capture_settled_by_accessibility(DirectSelection::Text("thread".to_owned())),
            Some(selected("thread"))
        );
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
