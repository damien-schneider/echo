use super::types::{ActiveAppInfo, InputEntry};
use rdev::Key;
use std::time::Instant;

pub const MIN_CHARS_FOR_SAVE: usize = 3;

#[derive(Debug, Clone, Default)]
pub struct ModifierState {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
    /// Cmd on macOS, Win on Windows
    pub meta: bool,
}

impl ModifierState {
    pub fn any_modifier(&self) -> bool {
        self.ctrl || self.alt || self.meta
    }

    #[cfg(target_os = "macos")]
    pub fn is_word_modifier(&self) -> bool {
        self.alt && !self.ctrl && !self.meta
    }

    #[cfg(not(target_os = "macos"))]
    pub fn is_word_modifier(&self) -> bool {
        self.ctrl && !self.alt && !self.meta
    }

    #[cfg(target_os = "macos")]
    pub fn is_line_modifier(&self) -> bool {
        self.meta && !self.ctrl && !self.alt
    }

    #[cfg(not(target_os = "macos"))]
    // Windows/Linux navigate lines with Home/End, no modifier
    pub fn is_line_modifier(&self) -> bool {
        false
    }

    pub fn update(&mut self, key: Key, pressed: bool) {
        match key {
            Key::ShiftLeft | Key::ShiftRight => self.shift = pressed,
            Key::ControlLeft | Key::ControlRight => self.ctrl = pressed,
            Key::Alt | Key::AltGr => self.alt = pressed,
            Key::MetaLeft | Key::MetaRight => self.meta = pressed,
            _ => {}
        }
    }

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

pub struct InputState {
    buffer: String,
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
    pub fn append_char(&mut self, c: char) {
        if self.session_start.is_none() {
            self.session_start = Some(Instant::now());
        }
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

    pub fn handle_delete(&mut self) {
        if self.cursor_position < self.buffer.len() {
            self.buffer.remove(self.cursor_position);
        }
        self.last_keystroke = Some(Instant::now());
    }

    pub fn clear(&mut self) {
        log::debug!("[InputTracker] Clearing buffer (was: '{}')", self.buffer);
        self.buffer.clear();
        self.cursor_position = 0;
        self.last_keystroke = None;
        self.session_start = None;
    }

    pub fn is_idle(&self, timeout: std::time::Duration) -> bool {
        self.last_keystroke
            .map(|t| t.elapsed() >= timeout)
            .unwrap_or(false)
    }

    pub fn has_content(&self) -> bool {
        self.buffer.trim().len() >= MIN_CHARS_FOR_SAVE
    }

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

    pub fn set_current_app(&mut self, app: ActiveAppInfo) {
        self.current_app = app;
    }

    pub fn move_cursor_left(&mut self) {
        if self.cursor_position > 0 {
            self.cursor_position -= 1;
        }
        self.last_keystroke = Some(Instant::now());
    }

    pub fn move_cursor_right(&mut self) {
        if self.cursor_position < self.buffer.len() {
            self.cursor_position += 1;
        }
        self.last_keystroke = Some(Instant::now());
    }

    pub fn move_cursor_to_start(&mut self) {
        self.cursor_position = 0;
        self.last_keystroke = Some(Instant::now());
    }

    pub fn move_cursor_to_end(&mut self) {
        self.cursor_position = self.buffer.len();
        self.last_keystroke = Some(Instant::now());
    }

    pub fn move_cursor_word_left(&mut self) {
        if self.cursor_position == 0 {
            return;
        }

        let chars: Vec<char> = self.buffer.chars().collect();
        let mut pos = self.cursor_position;

        while pos > 0 && Self::is_word_boundary(chars[pos - 1]) {
            pos -= 1;
        }

        while pos > 0 && !Self::is_word_boundary(chars[pos - 1]) {
            pos -= 1;
        }

        self.cursor_position = pos;
        self.last_keystroke = Some(Instant::now());
    }

    pub fn move_cursor_word_right(&mut self) {
        let chars: Vec<char> = self.buffer.chars().collect();
        let len = chars.len();

        if self.cursor_position >= len {
            return;
        }

        let mut pos = self.cursor_position;

        while pos < len && !Self::is_word_boundary(chars[pos]) {
            pos += 1;
        }

        while pos < len && Self::is_word_boundary(chars[pos]) {
            pos += 1;
        }

        self.cursor_position = pos;
        self.last_keystroke = Some(Instant::now());
    }

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
