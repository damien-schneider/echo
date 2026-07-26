const MODIFIERS: [&str; 11] = [
    "ctrl", "control", "shift", "alt", "option", "meta", "command", "cmd", "super", "win",
    "windows",
];

pub(super) fn to_portal_trigger(binding: &str) -> String {
    binding
        .split('+')
        .map(str::trim)
        .map(portal_part)
        .collect::<Vec<_>>()
        .join("+")
}

fn portal_part(part: &str) -> &str {
    match part.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => "Control",
        "alt" | "option" => "Alt",
        "shift" => "Shift",
        "meta" | "cmd" | "command" | "super" | "win" | "windows" => "Super",
        _ => part,
    }
}

pub(super) fn to_gtk_accelerator(binding: &str) -> String {
    binding.split('+').map(str::trim).map(gtk_part).collect()
}

fn gtk_part(part: &str) -> &str {
    match part.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => "<Control>",
        "alt" | "option" => "<Alt>",
        "shift" => "<Shift>",
        "meta" | "cmd" | "command" | "super" | "win" | "windows" => "<Super>",
        _ => part,
    }
}

pub(super) fn printable_key_from_binding(binding: &str) -> Option<String> {
    binding.split('+').find_map(|part| {
        let key = part.trim().to_ascii_lowercase();
        (!MODIFIERS.contains(&key.as_str()) && is_printable_key(&key)).then_some(key)
    })
}

pub(super) fn trigger_has_printable_key(trigger: &str) -> bool {
    let key = trigger
        .rsplit_once('>')
        .map(|(_, key)| key.trim())
        .or_else(|| trigger.split_whitespace().last())
        .unwrap_or_default();
    is_printable_key(key)
}

fn is_printable_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    key == "space"
        || (key.len() == 1 && key.chars().next().is_some_and(char::is_alphanumeric))
        || key.starts_with("num")
        || key.starts_with("kp")
}

#[cfg(test)]
mod tests {
    use super::{
        printable_key_from_binding, to_gtk_accelerator, to_portal_trigger,
        trigger_has_printable_key,
    };

    #[test]
    fn converts_portal_triggers() {
        assert_eq!(to_portal_trigger("ctrl+space"), "Control+space");
        assert_eq!(to_portal_trigger("ctrl+shift+space"), "Control+Shift+space");
        assert_eq!(to_portal_trigger("alt+a"), "Alt+a");
        assert_eq!(to_portal_trigger("super+shift+f1"), "Super+Shift+f1");
        assert_eq!(to_portal_trigger("meta+x"), "Super+x");
    }

    #[test]
    fn converts_gtk_accelerators() {
        assert_eq!(to_gtk_accelerator("ctrl+space"), "<Control>space");
        assert_eq!(to_gtk_accelerator("ctrl+shift+r"), "<Control><Shift>r");
        assert_eq!(to_gtk_accelerator("alt+a"), "<Alt>a");
        assert_eq!(to_gtk_accelerator("super+shift+f1"), "<Super><Shift>f1");
        assert_eq!(to_gtk_accelerator("meta+x"), "<Super>x");
    }

    #[test]
    fn detects_printable_keys() {
        assert!(trigger_has_printable_key("Press <Control>space"));
        assert!(trigger_has_printable_key("Press <Control><Shift>a"));
        assert!(!trigger_has_printable_key("Press <Control><Shift>F1"));
        assert!(!trigger_has_printable_key("Press <Super><Shift>Escape"));
        assert_eq!(printable_key_from_binding("ctrl+a").as_deref(), Some("a"));
    }

    #[test]
    fn malformed_triggers_are_not_printable() {
        assert!(!trigger_has_printable_key(""));
        assert!(!trigger_has_printable_key("Press <Control>"));
        assert!(!trigger_has_printable_key("Press"));
    }
}
