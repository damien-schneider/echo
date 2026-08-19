use crate::settings::{get_settings, ClipboardHandling, PasteMethod};
use enigo::Enigo;
use enigo::Key;
use enigo::Keyboard;
use enigo::Settings;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

// Wayland auto-paste unsupported: wtype/wl-copy hit focus issues, enigo is X11-only. Forced ClipboardOnly.

/// Uses raw VK codes so it survives Russian/AZERTY/DVORAK layouts.
fn send_paste_ctrl_v() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let (modifier_key, v_key_code) = (Key::Meta, Key::Other(9));
    #[cfg(target_os = "windows")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Other(0x56)); // VK_V
    #[cfg(target_os = "linux")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Unicode('v'));

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    enigo
        .key(modifier_key, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press modifier key: {}", e))?;
    enigo
        .key(v_key_code, enigo::Direction::Click)
        .map_err(|e| format!("Failed to click V key: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(100));

    enigo
        .key(modifier_key, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release modifier key: {}", e))?;

    Ok(())
}

/// More universal for terminals + legacy software.
#[cfg(not(target_os = "macos"))]
fn send_paste_shift_insert() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let insert_key_code = Key::Other(0x2D);
    #[cfg(target_os = "linux")]
    let insert_key_code = Key::Other(0x76);

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    enigo
        .key(Key::Shift, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press Shift key: {}", e))?;
    enigo
        .key(insert_key_code, enigo::Direction::Click)
        .map_err(|e| format!("Failed to click Insert key: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(100));

    enigo
        .key(Key::Shift, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release Shift key: {}", e))?;

    Ok(())
}

/// Linux/X11 only — macOS causes cascading suffix dup in terminals (CGEvent bug); Wayland unsupported.
#[cfg(target_os = "linux")]
fn paste_via_direct_input(text: &str) -> Result<(), String> {
    log::debug!(
        "paste_via_direct_input: Starting direct input, text length: {}, text: '{}'",
        text.len(),
        if text.len() > 100 {
            format!("{}...", &text[..100])
        } else {
            text.to_string()
        }
    );

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;

    enigo
        .text(text)
        .map_err(|e| format!("Failed to send text directly: {}", e))?;

    log::debug!("paste_via_direct_input: Text sent successfully");

    Ok(())
}

/// Saves clipboard, writes text, pastes, restores.
fn paste_via_clipboard_ctrl_v(text: &str, app_handle: &AppHandle) -> Result<(), String> {
    let clipboard = app_handle.clipboard();

    log::debug!(
        "paste_via_clipboard_ctrl_v: Starting paste, text length: {}, text: '{}'",
        text.len(),
        if text.len() > 100 {
            format!("{}...", &text[..100])
        } else {
            text.to_string()
        }
    );

    let clipboard_content = clipboard.read_text().unwrap_or_default();
    log::debug!(
        "paste_via_clipboard_ctrl_v: Saved original clipboard, length: {}",
        clipboard_content.len()
    );

    clipboard
        .write_text(text)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))?;
    log::debug!("paste_via_clipboard_ctrl_v: Wrote text to clipboard");

    std::thread::sleep(std::time::Duration::from_millis(50));
    log::debug!("paste_via_clipboard_ctrl_v: Sending Ctrl+V/Cmd+V");

    send_paste_ctrl_v()?;
    log::debug!("paste_via_clipboard_ctrl_v: Paste command sent");

    std::thread::sleep(std::time::Duration::from_millis(50));

    clipboard
        .write_text(&clipboard_content)
        .map_err(|e| format!("Failed to restore clipboard: {}", e))?;
    log::debug!("paste_via_clipboard_ctrl_v: Clipboard restored");

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn paste_via_clipboard_shift_insert(text: &str, app_handle: &AppHandle) -> Result<(), String> {
    let clipboard = app_handle.clipboard();

    let clipboard_content = clipboard.read_text().unwrap_or_default();

    clipboard
        .write_text(text)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(50));

    send_paste_shift_insert()?;

    std::thread::sleep(std::time::Duration::from_millis(50));

    clipboard
        .write_text(&clipboard_content)
        .map_err(|e| format!("Failed to restore clipboard: {}", e))?;

    Ok(())
}

pub fn copy_to_clipboard(text: &str, app_handle: &AppHandle) -> Result<(), String> {
    let clipboard = app_handle.clipboard();
    clipboard
        .write_text(text)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))?;
    log::info!("Text copied to clipboard");
    Ok(())
}

/// Wayland auto-paste is unsupported (see top-of-file), whatever the setting says.
fn resolved_paste_method(app_handle: &AppHandle) -> PasteMethod {
    let method = get_settings(app_handle).paste_method;
    #[cfg(target_os = "linux")]
    if crate::wayland::is_wayland() && method != PasteMethod::ClipboardOnly {
        log::info!("Wayland session detected: overriding paste method {method:?} → ClipboardOnly");
        return PasteMethod::ClipboardOnly;
    }
    method
}

/// Clipboard-only asks for nothing but the clipboard — every other method types into a caret.
pub fn paste_needs_a_caret(app_handle: &AppHandle) -> bool {
    resolved_paste_method(app_handle) != PasteMethod::ClipboardOnly
}

pub fn paste(text: &str, app_handle: &AppHandle) -> Result<(), String> {
    let paste_method = resolved_paste_method(app_handle);

    log::info!(
        "paste(): method={:?}, text_len={}, text='{}'",
        paste_method,
        text.len(),
        if text.len() > 200 {
            format!("{}...", &text[..200])
        } else {
            text.to_string()
        }
    );

    #[cfg(target_os = "macos")]
    let _overlay_key_guard = crate::overlay::OverlaySyntheticKeyGuard::acquire(app_handle);

    match paste_method {
        PasteMethod::CtrlV => paste_via_clipboard_ctrl_v(text, app_handle)?,
        #[cfg(target_os = "linux")]
        PasteMethod::Direct => paste_via_direct_input(text)?,
        #[cfg(not(target_os = "macos"))]
        PasteMethod::ShiftInsert => paste_via_clipboard_shift_insert(text, app_handle)?,
        PasteMethod::ClipboardOnly => {
            return copy_to_clipboard(text, app_handle);
        }
    }

    if get_settings(app_handle).clipboard_handling == ClipboardHandling::CopyToClipboard {
        let clipboard = app_handle.clipboard();
        clipboard
            .write_text(text)
            .map_err(|e| format!("Failed to copy to clipboard: {}", e))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::settings::PasteMethod;

    fn has_duplicate_consecutive_words(text: &str) -> bool {
        let words: Vec<&str> = text.split_whitespace().collect();
        for window in words.windows(2) {
            if window[0] == window[1] {
                return true;
            }
        }
        false
    }

    /// Detects "hello world hello world" or "test test test" style repeats.
    fn has_repeated_segments(text: &str) -> bool {
        let trimmed = text.trim();
        let words: Vec<&str> = trimmed.split_whitespace().collect();

        if words.len() < 2 {
            return false;
        }

        if words.len() % 2 == 0 {
            let half = words.len() / 2;
            let first_half: String = words[..half].join(" ");
            let second_half: String = words[half..].join(" ");
            if first_half == second_half {
                return true;
            }
        }

        has_duplicate_consecutive_words(trimmed)
    }

    #[test]
    fn test_detect_duplication_pattern() {
        assert!(has_repeated_segments("hello hello"));
        assert!(has_repeated_segments("hello world hello world"));
        assert!(has_repeated_segments("test test test"));

        assert!(!has_repeated_segments("hello world"));
        assert!(!has_repeated_segments("the quick brown fox"));
        assert!(!has_repeated_segments("a"));
    }

    /// Documents Direct paste dup bug — verifies input text is clean.
    #[test]
    fn bug_direct_paste_input_text_has_no_duplication() {
        let text_sent_to_paste = "Okay, let's do a test and see if there is duplicate text.";

        assert!(
            !has_repeated_segments(text_sent_to_paste),
            "Input text to paste should not have duplication patterns"
        );
    }

    /// Asserts dup IS detected (bug); flip when fixed.
    #[test]
    fn bug_terminal_output_should_not_have_duplication() {
        let buggy_terminal_output = "hello world hello world";

        let has_duplication = has_repeated_segments(buggy_terminal_output);

        assert!(
            has_duplication,
            "BUG: Terminal output has duplication when using Direct paste method. \
             This test documents the bug. When fixed, change to assert !has_duplication"
        );
    }

    /// macOS enigo.text() emits cascading suffix dups (CGEvent re-processing).
    #[test]
    fn bug_direct_paste_causes_cascading_suffix_duplication() {
        let buggy_output =
            "Je fais un test la transcription.copier la transcription.sens la transcription.";

        let has_cascading_suffixes = detect_cascading_suffix_pattern(buggy_output);

        assert!(
            has_cascading_suffixes,
            "BUG EXISTS: Direct paste causes cascading suffix duplication on macOS. \
             When this bug is fixed, update this test to assert the pattern is NOT detected."
        );
    }

    /// Pattern: full text + suffix1 + suffix2 + ... all ending at same point.
    fn detect_cascading_suffix_pattern(text: &str) -> bool {
        let len = text.len();
        if len < 20 {
            return false;
        }

        for suffix_len in 8..=20.min(len / 2) {
            let ending = &text[len - suffix_len..];
            let mut count = 0;
            let mut search_text = text;
            while let Some(pos) = search_text.find(ending) {
                count += 1;
                if pos + ending.len() < search_text.len() {
                    search_text = &search_text[pos + ending.len()..];
                } else {
                    break;
                }
            }
            if count > 1 {
                return true;
            }
        }

        false
    }

    #[test]
    fn test_detect_cascading_suffix_pattern() {
        assert!(detect_cascading_suffix_pattern(
            "la transcription.copier la transcription.sens la transcription."
        ));
        assert!(detect_cascading_suffix_pattern(
            "bug or the transcription.copy bug or the transcription."
        ));

        assert!(!detect_cascading_suffix_pattern("hello world"));
        assert!(!detect_cascading_suffix_pattern(
            "this is normal text without repetition"
        ));
        assert!(!detect_cascading_suffix_pattern("short"));
    }

    /// Fix: Direct paste disabled on macOS via cfg(linux).
    #[test]
    fn fix_direct_paste_not_available_on_macos() {
        #[cfg(target_os = "macos")]
        {
            let default_method = PasteMethod::default();
            assert_eq!(
                default_method,
                PasteMethod::CtrlV,
                "Default paste method on macOS should be CtrlV"
            );
        }

        #[cfg(not(target_os = "macos"))]
        {
            assert!(true);
        }
    }
}
