//! One reading of a shortcut string, shared by the recorder, stored bindings and every backend.

use std::collections::BTreeSet;
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Modifier {
    Fn,
    Ctrl,
    Alt,
    Shift,
    Super,
}

impl Modifier {
    fn named(token: &str) -> Option<Self> {
        match token {
            "fn" => Some(Self::Fn),
            "ctrl" | "control" => Some(Self::Ctrl),
            "alt" | "option" => Some(Self::Alt),
            "shift" => Some(Self::Shift),
            "command" | "cmd" | "super" | "meta" | "win" | "windows" => Some(Self::Super),
            _ => None,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Fn => "fn",
            Self::Ctrl => "ctrl",
            Self::Alt if cfg!(target_os = "macos") => "option",
            Self::Alt => "alt",
            Self::Shift => "shift",
            Self::Super if cfg!(target_os = "macos") => "command",
            Self::Super => "super",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Combo {
    modifiers: BTreeSet<Modifier>,
    key: Option<String>,
}

impl Combo {
    /// Any token order and casing; one key at most, and modifiers alone only with Fn.
    pub(super) fn parse(raw: &str) -> Result<Self, String> {
        if raw.trim().is_empty() {
            return Err("Press at least one key".into());
        }
        let mut modifiers = BTreeSet::new();
        let mut key = None;
        for token in raw.split('+').map(|token| token.trim().to_lowercase()) {
            if token.is_empty() {
                return Err(format!("'{raw}' is not a key combination"));
            }
            if let Some(modifier) = Modifier::named(&token) {
                modifiers.insert(modifier);
            } else if key.replace(token).is_some() {
                return Err(format!(
                    "'{raw}' has more than one key — hold modifiers and press a single key"
                ));
            }
        }
        let combo = Self { modifiers, key };
        if combo.key.is_none() && !combo.holds_fn() {
            return Err(format!("'{raw}' is only modifiers — add a key"));
        }
        Ok(combo)
    }

    /// Refuses combos that would swallow typing in every other app, and Fn where the OS never sees it.
    pub(super) fn usable(raw: &str) -> Result<Self, String> {
        let combo = Self::parse(raw)?;
        if combo.holds_fn() && !cfg!(target_os = "macos") {
            return Err("Fn shortcuts only work on macOS".into());
        }
        if combo.swallows_typing() {
            return Err(format!(
                "'{combo}' would stop that key from typing in every app — add a modifier like ctrl"
            ));
        }
        if let Some(key) = combo
            .key()
            .filter(|key| combo.holds_fn() && macos_marks_as_fn(key))
        {
            return Err(format!(
                "macOS marks {key} as an Fn key even without Fn held, so '{combo}' would take over every {key} press — drop fn or pick another key"
            ));
        }
        Ok(combo)
    }

    pub(super) fn holds_fn(&self) -> bool {
        self.modifiers.contains(&Modifier::Fn)
    }

    pub(super) fn key(&self) -> Option<&str> {
        self.key.as_deref()
    }

    pub(super) fn modifier_names(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.modifiers.iter().map(|modifier| modifier.name())
    }

    fn swallows_typing(&self) -> bool {
        let unmodified = self
            .modifiers
            .iter()
            .all(|modifier| *modifier == Modifier::Shift);
        unmodified && self.key().is_some_and(types_text)
    }
}

impl fmt::Display for Combo {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut tokens: Vec<&str> = self.modifier_names().collect();
        tokens.extend(self.key());
        formatter.write_str(&tokens.join("+"))
    }
}

fn types_text(key: &str) -> bool {
    key.chars().count() == 1
        || matches!(
            key,
            "space"
                | "enter"
                | "tab"
                | "backspace"
                | "delete"
                | "esc"
                | "up"
                | "down"
                | "left"
                | "right"
        )
        || (key.starts_with("num") && key != "numlock")
}

/// The arrows, the navigation cluster and the F-keys carry the Fn flag on macOS whether Fn is held or not.
fn macos_marks_as_fn(key: &str) -> bool {
    matches!(
        key,
        "up" | "down"
            | "left"
            | "right"
            | "home"
            | "end"
            | "pageup"
            | "pagedown"
            | "delete"
            | "insert"
    ) || key
        .strip_prefix('f')
        .is_some_and(|number| number.parse::<u8>().is_ok())
}

#[cfg(test)]
#[path = "combo_tests.rs"]
mod tests;
