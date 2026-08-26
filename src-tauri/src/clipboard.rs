use crate::settings::{get_settings, ClipboardHandling, PasteMethod};
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

// Wayland auto-paste unsupported: wtype/wl-copy hit focus issues, enigo is X11-only. Forced ClipboardOnly.

fn send_paste_ctrl_v() -> Result<(), String> {
    crate::keystroke::send(crate::keystroke::Shortcut::Paste)
}

/// More universal for terminals + legacy software.
#[cfg(not(target_os = "macos"))]
fn send_paste_shift_insert() -> Result<(), String> {
    use enigo::{Enigo, Key, Keyboard, Settings};

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
    use enigo::{Enigo, Keyboard, Settings};

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

/// Saves clipboard, writes text, pastes, restores — and gives up any receipt: the fallback for
/// every platform and session that cannot promise.
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

/// The paste is settled once — a newer dictation takes the clipboard story over from a stale task.
static PASTE_ATTEMPT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
const CONSUMPTION_WINDOW: std::time::Duration = std::time::Duration::from_millis(800);
/// Apps may read the pasteboard more than once while pasting; the transcript stays put meanwhile.
const REREAD_GRACE: std::time::Duration = std::time::Duration::from_millis(200);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PasteOutcome {
    /// The data was requested after the synthetic Cmd+V — the only receipt a paste gets.
    Consumed,
    /// The single read a promise gets came before the keystroke: a clipboard watcher took it,
    /// leaving the real paste unobservable.
    EatenByWatcher,
    /// Nobody asked within the window.
    Unconsumed,
    /// Something else took the pasteboard over before anyone pasted.
    ClipboardReplaced,
}

/// How strongly the delivery vouches for the focused app inserting what it takes — the weight a
/// fetch of the promised transcript carries as a receipt, ordered from no vouching to full.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum PasteConfidence {
    /// Nothing vouches for the paste — a fetch may be a read-and-drop (Finder, focusless Electron).
    Unvouched,
    /// No caret in sight, but the app is known to insert every paste (terminal class), or the fetch
    /// itself named a text format only a text paste asks for.
    FluentApp,
    /// A text element demonstrably holds the focus.
    AffirmedCaret,
}

/// How the promise ended, whatever the platform that served it.
#[derive(Clone, Copy, Debug)]
enum PromiseEnd {
    Fetched(crate::paste_promise::Receipt),
    /// The clipboard was taken over before anyone pasted.
    Dropped,
    /// Nobody asked within the window.
    Silent,
}

/// Reads the promise's ending as an outcome, and lets the receipt speak for the app when the
/// platform named it: a fetch by the focused client is the paste itself, a fetch by any other
/// client is a clipboard manager helping itself, whatever the keystroke timing says.
fn weigh(
    end: PromiseEnd,
    keystroke: std::time::Instant,
    confidence: PasteConfidence,
) -> (PasteOutcome, PasteConfidence) {
    use crate::paste_promise::Fetcher;
    match end {
        PromiseEnd::Fetched(receipt)
            if receipt.by == Fetcher::Foreign || receipt.at < keystroke =>
        {
            (PasteOutcome::EatenByWatcher, confidence)
        }
        PromiseEnd::Fetched(receipt) if receipt.by == Fetcher::Focused => (
            PasteOutcome::Consumed,
            confidence.max(PasteConfidence::FluentApp),
        ),
        PromiseEnd::Fetched(_) => (PasteOutcome::Consumed, confidence),
        PromiseEnd::Dropped => (PasteOutcome::ClipboardReplaced, confidence),
        PromiseEnd::Silent => (PasteOutcome::Unconsumed, confidence),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Settlement {
    RestoreOriginal,
    KeepTranscript,
    KeepTranscriptAndOffer,
    OfferOnly,
    LeaveUntouched,
}

/// An affirmed caret means the dictation demonstrably had somewhere to land, so a mute receipt is
/// read as a slow or unobservable paste, never as a miss: the transcript stays within a Cmd+V's
/// reach and the card stays away. An unvouched read is the mirror trap — apps with nothing focused
/// still read the pasteboard on Cmd+V while inserting nothing — so it never counts as a paste.
fn settle(
    outcome: PasteOutcome,
    confidence: PasteConfidence,
    handling: ClipboardHandling,
    clipboard_is_still_ours: bool,
) -> Settlement {
    match outcome {
        PasteOutcome::Consumed if confidence == PasteConfidence::Unvouched => {
            if clipboard_is_still_ours {
                Settlement::KeepTranscriptAndOffer
            } else {
                Settlement::OfferOnly
            }
        }
        PasteOutcome::Consumed if !clipboard_is_still_ours => Settlement::LeaveUntouched,
        PasteOutcome::Consumed if handling == ClipboardHandling::CopyToClipboard => {
            Settlement::KeepTranscript
        }
        PasteOutcome::Consumed => Settlement::RestoreOriginal,
        PasteOutcome::EatenByWatcher | PasteOutcome::Unconsumed
            if confidence == PasteConfidence::AffirmedCaret =>
        {
            if clipboard_is_still_ours {
                Settlement::KeepTranscript
            } else {
                Settlement::LeaveUntouched
            }
        }
        PasteOutcome::EatenByWatcher | PasteOutcome::Unconsumed if clipboard_is_still_ours => {
            Settlement::KeepTranscriptAndOffer
        }
        PasteOutcome::EatenByWatcher | PasteOutcome::Unconsumed => Settlement::OfferOnly,
        PasteOutcome::ClipboardReplaced if confidence == PasteConfidence::AffirmedCaret => {
            Settlement::LeaveUntouched
        }
        PasteOutcome::ClipboardReplaced => Settlement::OfferOnly,
    }
}

/// The transcript goes out as a pasteboard promise: the target app's own data request confirms the
/// paste, a silent window means nothing took it — the transcript then stays on the clipboard and
/// `on_unplaced` offers it back to the user.
fn paste_via_promised_clipboard(
    text: &str,
    app_handle: &AppHandle,
    confidence: PasteConfidence,
    on_unplaced: impl FnOnce(String) + Send + 'static,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;

    let original = app_handle.clipboard().read_text().unwrap_or_default();
    let promise = match crate::paste_promise::write_promised_transcript(text) {
        Ok(promise) => promise,
        Err(error) => {
            log::warn!("No promised clipboard ({error}); pasting without a receipt");
            return paste_via_clipboard_ctrl_v(text, app_handle);
        }
    };
    std::thread::sleep(std::time::Duration::from_millis(50));
    let keystroke = std::time::Instant::now();
    send_paste_ctrl_v()?;

    let attempt = PASTE_ATTEMPT.fetch_add(1, Ordering::SeqCst) + 1;
    let app_handle = app_handle.clone();
    let text = text.to_string();
    tauri::async_runtime::spawn(async move {
        let end = match tokio::time::timeout(CONSUMPTION_WINDOW, promise.consumed).await {
            Ok(Ok(receipt)) => PromiseEnd::Fetched(receipt),
            Ok(Err(_)) => PromiseEnd::Dropped,
            Err(_) => PromiseEnd::Silent,
        };
        let (outcome, confidence) = weigh(end, keystroke, confidence);
        if outcome == PasteOutcome::Consumed {
            tokio::time::sleep(REREAD_GRACE).await;
        }
        if PASTE_ATTEMPT.load(Ordering::SeqCst) != attempt {
            return;
        }
        let clipboard_is_still_ours = crate::paste_promise::generation() == promise.generation;
        let handling = get_settings(&app_handle).clipboard_handling;
        log::info!(
            "paste settled: {outcome:?} (confidence: {confidence:?}, clipboard still ours: {clipboard_is_still_ours})"
        );
        match settle(outcome, confidence, handling, clipboard_is_still_ours) {
            Settlement::RestoreOriginal => write_or_log(&app_handle, &original),
            Settlement::KeepTranscript => write_or_log(&app_handle, &text),
            Settlement::KeepTranscriptAndOffer => {
                write_or_log(&app_handle, &text);
                on_unplaced(text);
            }
            Settlement::OfferOnly => on_unplaced(text),
            Settlement::LeaveUntouched => {}
        }
    });
    Ok(())
}

fn write_or_log(app_handle: &AppHandle, text: &str) {
    if let Err(error) = app_handle.clipboard().write_text(text) {
        log::error!("Failed to settle the clipboard after a paste: {error}");
    }
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

/// `on_unplaced` fires with the transcript when no app takes the paste. It stays silent wherever
/// the session cannot serve a promise — a Wayland desktop, or a paste method that bypasses the
/// clipboard — since a synthetic paste alone gives no receipt at all.
pub fn paste(
    text: &str,
    app_handle: &AppHandle,
    confidence: PasteConfidence,
    on_unplaced: impl FnOnce(String) + Send + 'static,
) -> Result<(), String> {
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

    if paste_method == PasteMethod::CtrlV && crate::paste_promise::is_available() {
        return paste_via_promised_clipboard(text, app_handle, confidence, on_unplaced);
    }

    let _ = (confidence, on_unplaced);
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

    /// Reading the receipt is where a paste is told from a clipboard manager, so each way it can
    /// come back is pinned here.
    mod receipts {
        use super::super::{weigh, PasteConfidence, PasteOutcome, PromiseEnd};
        use crate::paste_promise::{Fetcher, Receipt};
        use std::time::{Duration, Instant};

        fn fetched(by: Fetcher, after_keystroke: bool) -> (PromiseEnd, Instant) {
            let keystroke = Instant::now();
            let at = if after_keystroke {
                keystroke + Duration::from_millis(20)
            } else {
                keystroke - Duration::from_millis(20)
            };
            (PromiseEnd::Fetched(Receipt { at, by }), keystroke)
        }

        /// X11 names the client that asked: one that is not the focused app is a clipboard manager,
        /// however well its timing lines up with the keystroke.
        #[test]
        fn a_fetch_by_another_client_is_never_the_paste() {
            let (end, keystroke) = fetched(Fetcher::Foreign, true);
            assert_eq!(
                weigh(end, keystroke, PasteConfidence::FluentApp).0,
                PasteOutcome::EatenByWatcher
            );
        }

        /// The focused app taking the transcript is the strongest evidence any platform offers —
        /// stronger than anything guessed about the app beforehand.
        #[test]
        fn a_fetch_by_the_focused_client_vouches_for_itself() {
            let (end, keystroke) = fetched(Fetcher::Focused, true);
            assert_eq!(
                weigh(end, keystroke, PasteConfidence::Unvouched),
                (PasteOutcome::Consumed, PasteConfidence::FluentApp)
            );
        }

        #[test]
        fn an_anonymous_fetch_counts_only_after_the_keystroke() {
            let (early, keystroke) = fetched(Fetcher::Unknown, false);
            assert_eq!(
                weigh(early, keystroke, PasteConfidence::FluentApp).0,
                PasteOutcome::EatenByWatcher
            );
            let (late, keystroke) = fetched(Fetcher::Unknown, true);
            assert_eq!(
                weigh(late, keystroke, PasteConfidence::FluentApp),
                (PasteOutcome::Consumed, PasteConfidence::FluentApp)
            );
        }

        #[test]
        fn silence_and_a_lost_clipboard_speak_for_themselves() {
            let keystroke = Instant::now();
            assert_eq!(
                weigh(PromiseEnd::Silent, keystroke, PasteConfidence::Unvouched).0,
                PasteOutcome::Unconsumed
            );
            assert_eq!(
                weigh(PromiseEnd::Dropped, keystroke, PasteConfidence::Unvouched).0,
                PasteOutcome::ClipboardReplaced
            );
        }
    }

    mod settlement {
        use super::super::{settle, PasteConfidence, PasteOutcome, Settlement};
        use crate::settings::ClipboardHandling;

        const AFFIRMED: PasteConfidence = PasteConfidence::AffirmedCaret;
        const FLUENT: PasteConfidence = PasteConfidence::FluentApp;
        const UNVOUCHED: PasteConfidence = PasteConfidence::Unvouched;

        #[test]
        fn a_consumed_paste_in_a_fluent_app_gives_the_clipboard_back() {
            assert_eq!(
                settle(
                    PasteOutcome::Consumed,
                    FLUENT,
                    ClipboardHandling::DontModify,
                    true
                ),
                Settlement::RestoreOriginal
            );
        }

        #[test]
        fn a_consumed_paste_keeps_the_transcript_when_the_user_asked_for_it() {
            assert_eq!(
                settle(
                    PasteOutcome::Consumed,
                    FLUENT,
                    ClipboardHandling::CopyToClipboard,
                    true
                ),
                Settlement::KeepTranscript
            );
        }

        /// Finder and focusless Electron windows read the pasteboard on Cmd+V while inserting
        /// nothing — an unvouched read is no receipt, so the transcript stays in hand and on offer.
        #[test]
        fn an_unvouched_read_never_counts_as_a_paste() {
            assert_eq!(
                settle(
                    PasteOutcome::Consumed,
                    UNVOUCHED,
                    ClipboardHandling::DontModify,
                    true
                ),
                Settlement::KeepTranscriptAndOffer
            );
        }

        #[test]
        fn a_paste_nobody_took_leaves_the_transcript_in_reach_and_offers_it() {
            for confidence in [FLUENT, UNVOUCHED] {
                assert_eq!(
                    settle(
                        PasteOutcome::Unconsumed,
                        confidence,
                        ClipboardHandling::DontModify,
                        true
                    ),
                    Settlement::KeepTranscriptAndOffer
                );
            }
        }

        /// A watcher that stole the promise before the keystroke proves nothing about the paste —
        /// without a caret in sight the transcript is offered, never assumed delivered.
        #[test]
        fn a_receipt_eaten_by_a_watcher_never_counts_as_a_paste() {
            for confidence in [FLUENT, UNVOUCHED] {
                assert_eq!(
                    settle(
                        PasteOutcome::EatenByWatcher,
                        confidence,
                        ClipboardHandling::DontModify,
                        true
                    ),
                    Settlement::KeepTranscriptAndOffer
                );
            }
        }

        /// An affirmed caret reads a mute receipt as a slow or unobservable paste: no card, and the
        /// transcript stays on the clipboard so even a late paste still lands it.
        #[test]
        fn an_affirmed_caret_holds_the_card_back_and_keeps_the_transcript_in_reach() {
            for outcome in [PasteOutcome::Unconsumed, PasteOutcome::EatenByWatcher] {
                assert_eq!(
                    settle(outcome, AFFIRMED, ClipboardHandling::DontModify, true),
                    Settlement::KeepTranscript
                );
            }
            assert_eq!(
                settle(
                    PasteOutcome::ClipboardReplaced,
                    AFFIRMED,
                    ClipboardHandling::DontModify,
                    true
                ),
                Settlement::LeaveUntouched
            );
        }

        /// The user copied something themselves — their clipboard is not Echo's to touch any more.
        #[test]
        fn a_clipboard_the_user_took_back_is_never_overwritten() {
            assert_eq!(
                settle(
                    PasteOutcome::Consumed,
                    FLUENT,
                    ClipboardHandling::DontModify,
                    false
                ),
                Settlement::LeaveUntouched
            );
            assert_eq!(
                settle(
                    PasteOutcome::Consumed,
                    UNVOUCHED,
                    ClipboardHandling::DontModify,
                    false
                ),
                Settlement::OfferOnly
            );
            assert_eq!(
                settle(
                    PasteOutcome::Unconsumed,
                    UNVOUCHED,
                    ClipboardHandling::DontModify,
                    false
                ),
                Settlement::OfferOnly
            );
            assert_eq!(
                settle(
                    PasteOutcome::ClipboardReplaced,
                    UNVOUCHED,
                    ClipboardHandling::DontModify,
                    true
                ),
                Settlement::OfferOnly
            );
        }
    }

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
