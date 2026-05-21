//! Centralized policy for "do we run cleanup on this transcript?"
//!
//! All four call sites that emit raw whisper / parakeet output to the
//! frontend (live streaming, batch chunked, batch diarized, dictation
//! finalize) funnel through [`cleanup_or_filter`] so the rules stay in
//! one place:
//!
//!  1. Empty input passes through unchanged.
//!  2. Hallucination filter is authoritative — even when cleanup is on,
//!     a hallucinated string maps to empty (`""`). This preserves the
//!     existing "drop whisper attractor strings" behavior so cleanup on
//!     never reintroduces them.
//!  3. If `cleanup_enabled = false`, we return the raw text (post-filter)
//!     without touching the model. Zero overhead when off.
//!  4. If `cleanup_enabled = true` AND the manager is loaded (read-lock
//!     succeeds), call `clean_blocking`. On any error, log and return raw.
//!  5. If `cleanup_enabled = true` but the manager is not loaded (state
//!     `None` OR the write lock is currently held by an init in flight),
//!     return raw and log a one-shot warning so the user knows cleanup
//!     was requested but not available.
//!
//! Using `try_read` instead of `read().await` is deliberate: the audio
//! thread calls this synchronously from inside `spawn_blocking`, and
//! the cleanup `RwLock` is *also* taken with `write().await` during
//! `cleanup_init`. A blocking `read` would deadlock the runtime if init
//! is in progress on the same multi-threaded runtime worker. Returning
//! raw (one decode without cleanup) is much better than wedging the
//! audio path.

use log::warn;
use std::sync::OnceLock;

use crate::commands::cleanup::CleanupState;
use crate::managers::cleanup_prompt::{apply_dictionary_prepass, CleanupContext};
use crate::managers::meeting_streaming::is_whisper_hallucination;
use crate::settings::AppSettings;

/// One-shot warning when `cleanup_enabled = true` but no model is loaded.
/// Avoids spamming the log on every decode.
static WARNED_NOT_LOADED: OnceLock<()> = OnceLock::new();

/// Apply hallucination filter and (optionally) cleanup-LLM pass to one
/// transcript. See module docs for the full policy.
///
/// `build_ctx` lets each call site construct the [`CleanupContext`] from
/// its own settings snapshot exactly once, without this helper needing to
/// know about Tauri's `AppHandle`. It's only invoked when we actually
/// have a manager to call into, so an `AppHandle::state` lookup for the
/// dictionary isn't paid on every decode.
pub fn cleanup_or_filter<F>(
    text: &str,
    cleanup_state: &CleanupState,
    settings: &AppSettings,
    build_ctx: F,
) -> String
where
    F: FnOnce() -> CleanupContext,
{
    if text.is_empty() {
        return String::new();
    }
    if is_whisper_hallucination(text) {
        return String::new();
    }
    if !settings.cleanup_enabled {
        return text.to_string();
    }

    // Build the context once so the same dictionary feeds both the
    // pre-pass and the LLM prompt.
    let ctx = build_ctx();

    // Pre-pass: variant→canonical regex substitution. Runs whenever
    // cleanup is enabled, even if the LLM manager is not loaded — that
    // way users still get spelling fixes for known names during the
    // model-loading window or after an init failure.
    let prepassed = apply_dictionary_prepass(text, &ctx.dictionary);

    // try_read avoids deadlock vs in-flight cleanup_init that holds the
    // write lock. If we can't get a read lock right now, skip cleanup
    // for this one decode (the next will likely succeed).
    let guard = match cleanup_state.try_read() {
        Ok(g) => g,
        Err(_) => {
            // Lock contended (init running). Return the pre-passed text
            // — losing one decode worth of LLM cleanup is fine, but the
            // dictionary substitutions still apply.
            return prepassed;
        }
    };

    let mgr = match guard.as_ref() {
        Some(m) => m,
        None => {
            // cleanup_enabled but model not loaded yet (user toggled it
            // on without invoking cleanup_init, or init failed).
            WARNED_NOT_LOADED.get_or_init(|| {
                warn!(
                    "[cleanup] cleanup_enabled=true but no model loaded; returning raw transcript (with dictionary pre-pass). Call cleanup_init to load the model."
                );
            });
            return prepassed;
        }
    };

    let started = std::time::Instant::now();
    match mgr.clean_blocking(&prepassed, &ctx) {
        Ok(cleaned) => {
            let elapsed_ms = started.elapsed().as_millis();
            log::debug!(
                "[cleanup] latency: {elapsed_ms}ms (raw_len={})",
                prepassed.len()
            );
            cleaned
        }
        Err(e) => {
            warn!("[cleanup] clean_blocking failed, returning pre-passed raw: {e:#}");
            prepassed
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::get_default_settings;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    fn settings_with_cleanup(enabled: bool) -> AppSettings {
        let mut s = get_default_settings();
        s.cleanup_enabled = enabled;
        s
    }

    fn empty_state() -> CleanupState {
        Arc::new(RwLock::new(None))
    }

    fn default_ctx() -> CleanupContext {
        CleanupContext::default()
    }

    #[test]
    fn passes_through_empty_input() {
        let state = empty_state();
        let settings = settings_with_cleanup(false);
        let out = cleanup_or_filter("", &state, &settings, default_ctx);
        assert_eq!(out, "");
    }

    #[test]
    fn passes_through_when_disabled() {
        let state = empty_state();
        let settings = settings_with_cleanup(false);
        let out = cleanup_or_filter(
            "Hello world, this is real speech",
            &state,
            &settings,
            default_ctx,
        );
        assert_eq!(out, "Hello world, this is real speech");
    }

    #[test]
    fn returns_empty_on_hallucination_when_disabled() {
        let state = empty_state();
        let settings = settings_with_cleanup(false);
        // The hallucination filter must remain authoritative even when
        // cleanup is off — this is the pre-cleanup behavior.
        let out = cleanup_or_filter("Thanks for watching!", &state, &settings, default_ctx);
        assert_eq!(out, "");
    }

    #[test]
    fn returns_empty_on_hallucination_when_enabled() {
        let state = empty_state();
        let settings = settings_with_cleanup(true);
        // Even if cleanup is on, hallucinations are dropped before we
        // bother loading the model. Important: the model must never see
        // (and potentially "clean up") an attractor string.
        let out = cleanup_or_filter("Thank you for watching.", &state, &settings, default_ctx);
        assert_eq!(out, "");
    }

    #[test]
    fn returns_raw_when_manager_not_loaded_and_enabled() {
        let state = empty_state(); // None inside RwLock
        let settings = settings_with_cleanup(true);
        let out = cleanup_or_filter(
            "Let's talk about the deadline next week",
            &state,
            &settings,
            default_ctx,
        );
        assert_eq!(out, "Let's talk about the deadline next week");
    }

    /// Disabled + non-hallucinated text + no model loaded should still
    /// short-circuit before any RwLock work. This documents that the
    /// fast path is purely a settings check.
    #[test]
    fn disabled_path_does_not_touch_state() {
        // We can't observe lock acquisition directly, but we can prove
        // the call still returns sensibly when state is unusable (e.g.
        // an already-held write lock would deadlock a blocking read).
        // Wrap state in an Arc and acquire the write lock outside —
        // cleanup_or_filter must NOT try to read it when disabled.
        let state: CleanupState = Arc::new(RwLock::new(None));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let _guard = rt.block_on(async { state.write().await });
        // If cleanup_or_filter tried to read here it would deadlock or
        // (with try_read) return raw; either way the assertion below
        // must hold. The point is: with disabled settings we never even
        // reach the lock.
        let settings = settings_with_cleanup(false);
        let out = cleanup_or_filter("plain text", &state, &settings, default_ctx);
        assert_eq!(out, "plain text");
    }

    /// `try_read` must NOT block the caller if the write lock is held
    /// (e.g. cleanup_init is in flight). We assert "returns raw" rather
    /// than "doesn't deadlock" because Rust's test harness has no easy
    /// way to fail a deadlocked test — but if try_read ever became
    /// `read().await` this test would hang.
    #[test]
    fn returns_raw_when_write_lock_contended() {
        let state: CleanupState = Arc::new(RwLock::new(None));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let _guard = rt.block_on(async { state.write().await });
        let settings = settings_with_cleanup(true);
        let out = cleanup_or_filter(
            "real speech that should not be lost",
            &state,
            &settings,
            default_ctx,
        );
        assert_eq!(out, "real speech that should not be lost");
    }

    // ── dictionary pre-pass integration ───────────────────────────────

    fn ctx_with_dict(canonical: &str, variants: &[&str]) -> CleanupContext {
        use crate::managers::cleanup_prompt::DictionaryEntry;
        CleanupContext {
            dictionary: vec![DictionaryEntry {
                canonical: canonical.to_string(),
                variants: variants.iter().map(|v| (*v).to_string()).collect(),
            }],
            ..CleanupContext::default()
        }
    }

    /// When cleanup is enabled but the manager is not loaded, the
    /// pre-pass must still apply dictionary substitutions to the raw
    /// transcript before it is returned to the caller.
    #[test]
    fn prepass_applies_when_manager_not_loaded_and_enabled() {
        let state = empty_state();
        let settings = settings_with_cleanup(true);
        let out = cleanup_or_filter(
            "I met Damian today",
            &state,
            &settings,
            || ctx_with_dict("Damien", &["Damian"]),
        );
        assert_eq!(out, "I met Damien today");
    }

    /// Same when the write lock is contended (init in flight): we still
    /// emit dictionary-corrected raw rather than naked raw.
    #[test]
    fn prepass_applies_when_write_lock_contended() {
        let state: CleanupState = Arc::new(RwLock::new(None));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let _guard = rt.block_on(async { state.write().await });
        let settings = settings_with_cleanup(true);
        let out = cleanup_or_filter(
            "talked with Damian",
            &state,
            &settings,
            || ctx_with_dict("Damien", &["Damian"]),
        );
        assert_eq!(out, "talked with Damien");
    }

    /// With cleanup disabled, the dictionary must NOT modify the text —
    /// this preserves the "zero overhead when off" guarantee documented
    /// at the top of the module.
    #[test]
    fn prepass_does_not_run_when_cleanup_disabled() {
        let state = empty_state();
        let settings = settings_with_cleanup(false);
        let out = cleanup_or_filter(
            "I met Damian today",
            &state,
            &settings,
            || ctx_with_dict("Damien", &["Damian"]),
        );
        assert_eq!(
            out, "I met Damian today",
            "cleanup disabled must skip the pre-pass entirely"
        );
    }
}
