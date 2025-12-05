//! Input state management for tracking typed content and modifier keys.

use super::types::{ActiveAppInfo, InputEntry};
use rdev::Key;
use std::time::Instant;

/// Minimum number of characters to trigger saving
pub const MIN_CHARS_FOR_SAVE: usize = 3;

/// Tracks the state of modifier keys
#[derive(Debug, Clone, Default)]
pub struct ModifierState {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub meta: bool, // Cmd on macOS, Win on Windows
}

impl ModifierState {
    /// Check if any modifier (except shift) is pressed
    pub fn any_modifier(&self) -> bool {
        self.ctrl || self.alt || self.meta
    }

    /// Check if the word-jump modifier is pressed
    /// On macOS: Option (alt) key
    /// On Windows/Linux: Ctrl key
    #[cfg(target_os = "macos")]
    pub fn is_word_modifier(&self) -> bool {
        self.alt && !self.ctrl && !self.meta
    }

    #[cfg(not(target_os = "macos"))]
    pub fn is_word_modifier(&self) -> bool {
        self.ctrl && !self.alt && !self.meta
    }

    /// Check if the line-jump modifier is pressed (move to start/end of line)
    /// On macOS: Cmd (meta) key
    /// On Windows/Linux: Not typically used for line navigation (Home/End keys used instead)
    #[cfg(target_os = "macos")]
    pub fn is_line_modifier(&self) -> bool {
        self.meta && !self.ctrl && !self.alt
    }

    #[cfg(not(target_os = "macos"))]
    pub fn is_line_modifier(&self) -> bool {
        false // On Windows/Linux, Home/End keys are used directly
    }

    /// Update modifier state based on key press/release
    pub fn update(&mut self, key: Key, pressed: bool) {
        match key {
            Key::ShiftLeft | Key::ShiftRight => self.shift = pressed,
            Key::ControlLeft | Key::ControlRight => self.ctrl = pressed,
            Key::Alt | Key::AltGr => self.alt = pressed,
            Key::MetaLeft | Key::MetaRight => self.meta = pressed,
            _ => {}
        }
    }

    /// Check if a key is a modifier key
    pub fn is_modifier_key(key: Key) -> bool {
        matches!(
            key,
            Key::ShiftLeft
                | Key::ShiftRight
                | Key::ControlLeft
                | Key::ControlRight
                | Key::Alt
                | Key::AltGr
                | Key::MetaLeft
                | Key::MetaRight
        )
    }
}

/// Internal state for tracking typed input
pub struct InputState {
    buffer: String,
    /// Cursor position within the buffer (0 = start, buffer.len() = end)
    cursor_position: usize,
    pub last_keystroke: Option<Instant>,
    session_start: Option<Instant>,
    current_app: ActiveAppInfo,
    pub modifiers: ModifierState,
}

impl Default for InputState {
    fn default() -> Self {
        Self {
            buffer: String::new(),
            cursor_position: 0,
            last_keystroke: None,
            session_start: None,
            current_app: ActiveAppInfo::default(),
            modifiers: ModifierState::default(),
        }
    }
}

impl InputState {
    /// Append a character at the current cursor position
    pub fn append_char(&mut self, c: char) {
        if self.session_start.is_none() {
            self.session_start = Some(Instant::now());
        }
        // Insert at cursor position instead of appending
        if self.cursor_position >= self.buffer.len() {
            self.buffer.push(c);
        } else {
            self.buffer.insert(self.cursor_position, c);
        }
        self.cursor_position += 1;
        self.last_keystroke = Some(Instant::now());
        log::debug!(
            "[InputTracker] Buffer: '{}' (cursor: {}, len: {})",
            self.buffer,
            self.cursor_position,
            self.buffer.len()
        );
    }

    /// Handle backspace key press
    pub fn handle_backspace(&mut self) {
        if self.cursor_position > 0 {
            self.cursor_position -= 1;
            if self.cursor_position < self.buffer.len() {
                self.buffer.remove(self.cursor_position);
            } else {
                self.buffer.pop();
            }
        }
        self.last_keystroke = Some(Instant::now());
    }

    /// Handle delete key press
    pub fn handle_delete(&mut self) {
        if self.cursor_position < self.buffer.len() {
            self.buffer.remove(self.cursor_position);
        }
        self.last_keystroke = Some(Instant::now());
    }

    /// Clear the buffer and reset state
    pub fn clear(&mut self) {
        log::debug!("[InputTracker] Clearing buffer (was: '{}')", self.buffer);
        self.buffer.clear();
        self.cursor_position = 0;
        self.last_keystroke = None;
        self.session_start = None;
    }

    /// Check if the input has been idle for the specified duration
    pub fn is_idle(&self, timeout: std::time::Duration) -> bool {
        self.last_keystroke
            .map(|t| t.elapsed() >= timeout)
            .unwrap_or(false)
    }

    /// Check if there's enough content to save
    pub fn has_content(&self) -> bool {
        self.buffer.trim().len() >= MIN_CHARS_FOR_SAVE
    }

    /// Take the current entry for saving, clearing the buffer
    pub fn take_entry(&mut self) -> Option<InputEntry> {
        if !self.has_content() {
            self.clear();
            return None;
        }

        let duration_ms = self
            .session_start
            .map(|s| s.elapsed().as_millis() as i64)
            .unwrap_or(0);

        let entry = InputEntry {
            app_name: self.current_app.name.clone(),
            app_bundle_id: self.current_app.bundle_id.clone(),
            app_pid: self.current_app.pid,
            content: self.buffer.clone(),
            timestamp: chrono::Utc::now().timestamp(),
            duration_ms,
        };

        self.clear();
        Some(entry)
    }

    /// Set the current application context
    pub fn set_current_app(&mut self, app: ActiveAppInfo) {
        self.current_app = app;
    }

    // --- Cursor movement methods ---

    /// Move cursor one position left
    pub fn move_cursor_left(&mut self) {
        if self.cursor_position > 0 {
            self.cursor_position -= 1;
        }
        self.last_keystroke = Some(Instant::now());
    }

    /// Move cursor one position right
    pub fn move_cursor_right(&mut self) {
        if self.cursor_position < self.buffer.len() {
            self.cursor_position += 1;
        }
        self.last_keystroke = Some(Instant::now());
    }

    /// Move cursor to the start of the buffer
    pub fn move_cursor_to_start(&mut self) {
        self.cursor_position = 0;
        self.last_keystroke = Some(Instant::now());
    }

    /// Move cursor to the end of the buffer
    pub fn move_cursor_to_end(&mut self) {
        self.cursor_position = self.buffer.len();
        self.last_keystroke = Some(Instant::now());
    }

    /// Move cursor to the start of the previous word
    /// Word boundaries are whitespace and common punctuation
    pub fn move_cursor_word_left(&mut self) {
        if self.cursor_position == 0 {
            return;
        }

        let chars: Vec<char> = self.buffer.chars().collect();
        let mut pos = self.cursor_position;

        // Skip any whitespace/punctuation immediately before cursor
        while pos > 0 && Self::is_word_boundary(chars[pos - 1]) {
            pos -= 1;
        }

        // Move through the word until we hit a boundary or start
        while pos > 0 && !Self::is_word_boundary(chars[pos - 1]) {
            pos -= 1;
        }

        self.cursor_position = pos;
        self.last_keystroke = Some(Instant::now());
    }

    /// Move cursor to the end of the next word
    /// Word boundaries are whitespace and common punctuation
    pub fn move_cursor_word_right(&mut self) {
        let chars: Vec<char> = self.buffer.chars().collect();
        let len = chars.len();

        if self.cursor_position >= len {
            return;
        }

        let mut pos = self.cursor_position;

        // Move through current word
        while pos < len && !Self::is_word_boundary(chars[pos]) {
            pos += 1;
        }

        // Skip any whitespace/punctuation after the word
        while pos < len && Self::is_word_boundary(chars[pos]) {
            pos += 1;
        }

        self.cursor_position = pos;
        self.last_keystroke = Some(Instant::now());
    }

    /// Check if a character is a word boundary (whitespace or punctuation)
    fn is_word_boundary(c: char) -> bool {
        c.is_whitespace()
            || matches!(
                c,
                '.' | ','
                    | ';'
                    | ':'
                    | '!'
                    | '?'
                    | '\''
                    | '"'
                    | '('
                    | ')'
                    | '['
                    | ']'
                    | '{'
                    | '}'
                    | '-'
                    | '_'
                    | '/'
                    | '\\'
                    | '@'
                    | '#'
                    | '$'
                    | '%'
                    | '^'
                    | '&'
                    | '*'
                    | '+'
                    | '='
                    | '<'
                    | '>'
                    | '|'
                    | '~'
                    | '`'
            )
    }
}
