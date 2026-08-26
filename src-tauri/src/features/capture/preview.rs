const PREVIEW_CHARACTERS: usize = 100;

pub(super) fn capture_preview(text: &str) -> String {
    let mut preview = String::new();
    let mut pending_space = false;

    for character in text.chars() {
        if character.is_whitespace() {
            pending_space = !preview.is_empty();
            continue;
        }
        if preview.chars().count() == PREVIEW_CHARACTERS {
            return format!("{preview}…");
        }
        if pending_space {
            preview.push(' ');
            pending_space = false;
        }
        preview.push(character);
    }

    preview
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapses_the_whitespace_a_selection_carries() {
        assert_eq!(
            capture_preview("  a wild\n\n  selection\ttext  "),
            "a wild selection text"
        );
    }

    #[test]
    fn clips_a_long_selection_on_a_character_boundary() {
        let preview = capture_preview(&"é".repeat(PREVIEW_CHARACTERS + 10));

        assert_eq!(preview.chars().count(), PREVIEW_CHARACTERS + 1);
        assert!(preview.ends_with('…'));
    }

    #[test]
    fn keeps_a_selection_that_already_fits() {
        let text = "é".repeat(PREVIEW_CHARACTERS);

        assert_eq!(capture_preview(&text), text);
    }
}
