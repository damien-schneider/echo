//! Single policy fork for all transcript emitters.

use log::warn;
use std::sync::OnceLock;

use crate::commands::cleanup::CleanupState;
use crate::managers::cleanup_prompt::{apply_dictionary_prepass, CleanupContext};
use crate::managers::meeting_streaming::is_whisper_hallucination;
use crate::settings::AppSettings;

static WARNED_NOT_LOADED: OnceLock<()> = OnceLock::new();

/// build_ctx lazy so AppHandle::state lookup skipped on every decode.
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

    let ctx = build_ctx();

    // Pre-pass runs even when LLM not loaded so name fixes work during loading window.
    let prepassed = apply_dictionary_prepass(text, &ctx.dictionary);

    // Never block transcription on optional cleanup state.
    let guard = match cleanup_state.try_read() {
        Ok(g) => g,
        Err(_) => {
            return prepassed;
        }
    };

    let mgr = match guard.as_ref() {
        Some(m) => m,
        None => {
            WARNED_NOT_LOADED.get_or_init(|| {
                warn!(
                    "[cleanup] applying deterministic dictionary pre-pass without a cleanup model"
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
        let out = cleanup_or_filter("Thanks for watching!", &state, &settings, default_ctx);
        assert_eq!(out, "");
    }

    #[test]
    fn returns_empty_on_hallucination_when_enabled() {
        // Model must never see attractor string.
        let state = empty_state();
        let settings = settings_with_cleanup(true);
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

    /// Disabled path must skip RwLock entirely.
    #[test]
    fn disabled_path_does_not_touch_state() {
        // Held write lock would deadlock a blocking read.
        let state: CleanupState = Arc::new(RwLock::new(None));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let _guard = rt.block_on(async { state.write().await });
        let settings = settings_with_cleanup(false);
        let out = cleanup_or_filter("plain text", &state, &settings, default_ctx);
        assert_eq!(out, "plain text");
    }

    /// Test would hang if try_read became read().await.
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

    #[test]
    fn prepass_applies_when_manager_not_loaded_and_enabled() {
        let state = empty_state();
        let settings = settings_with_cleanup(true);
        let out = cleanup_or_filter("I met Damian today", &state, &settings, || {
            ctx_with_dict("Damien", &["Damian"])
        });
        assert_eq!(out, "I met Damien today");
    }

    #[test]
    fn prepass_applies_when_write_lock_contended() {
        let state: CleanupState = Arc::new(RwLock::new(None));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let _guard = rt.block_on(async { state.write().await });
        let settings = settings_with_cleanup(true);
        let out = cleanup_or_filter("talked with Damian", &state, &settings, || {
            ctx_with_dict("Damien", &["Damian"])
        });
        assert_eq!(out, "talked with Damien");
    }

    /// Zero overhead when cleanup disabled.
    #[test]
    fn prepass_does_not_run_when_cleanup_disabled() {
        let state = empty_state();
        let settings = settings_with_cleanup(false);
        let out = cleanup_or_filter("I met Damian today", &state, &settings, || {
            ctx_with_dict("Damien", &["Damian"])
        });
        assert_eq!(
            out, "I met Damian today",
            "cleanup disabled must skip the pre-pass entirely"
        );
    }
}
