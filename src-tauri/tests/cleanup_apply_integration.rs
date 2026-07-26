//! Integration-test coverage for the cleanup-apply policy module.
//!
//! Unit tests live next to the implementation in
//! `src/managers/cleanup_apply.rs`; this file proves the helper still
//! does the right thing when invoked through the public crate surface
//! (i.e. the way the meeting / dictation paths call it).
//!
//! Model-gated tests that actually run the Qwen 1.5B GGUF pass are
//! marked `#[ignore]` and only run with `ECHO_CLEANUP_RUN_MODEL_TESTS=1`,
//! mirroring the gating in `cleanup.rs`.

use std::sync::Arc;
use tokio::sync::RwLock;

use echo_app_lib::commands::cleanup::CleanupState;
use echo_app_lib::managers::cleanup_apply::cleanup_or_filter;
use echo_app_lib::managers::cleanup_prompt::CleanupContext;
use echo_app_lib::settings::get_default_settings;

#[test]
fn cleanup_disabled_in_settings_preserves_existing_behavior() {
    // With cleanup_enabled = false (the privacy-first default), the
    // helper must behave exactly like the pre-Phase-1 codepath:
    // hallucinations dropped, real text returned verbatim, no model
    // touched. Empty text is also dropped.
    let state: CleanupState = Arc::new(RwLock::new(None));
    let settings = get_default_settings();
    assert!(!settings.cleanup_enabled, "cleanup must default to off");

    let real = cleanup_or_filter(
        "Let's ship the cleanup helper this week",
        &state,
        &settings,
        CleanupContext::default,
    );
    assert_eq!(real, "Let's ship the cleanup helper this week");

    let hallucination = cleanup_or_filter(
        "Thanks for watching!",
        &state,
        &settings,
        CleanupContext::default,
    );
    assert_eq!(hallucination, "");

    let empty = cleanup_or_filter("", &state, &settings, CleanupContext::default);
    assert_eq!(empty, "");
}

#[test]
fn cleanup_enabled_without_loaded_model_falls_back_to_raw() {
    // User toggled cleanup_enabled = true but never called
    // `cleanup_init` (model not loaded yet). The helper must NOT crash,
    // must NOT block, and must return the raw text so the dictation /
    // meeting flow doesn't lose the transcript. Hallucinations still
    // get dropped — the filter is authoritative.
    let state: CleanupState = Arc::new(RwLock::new(None));
    let mut settings = get_default_settings();
    settings.cleanup_enabled = true;

    let real = cleanup_or_filter(
        "Push the branch and open a PR",
        &state,
        &settings,
        CleanupContext::default,
    );
    assert_eq!(real, "Push the branch and open a PR");

    let hallucination = cleanup_or_filter(
        "Thank you for watching.",
        &state,
        &settings,
        CleanupContext::default,
    );
    assert_eq!(hallucination, "");
}

#[test]
fn cleanup_enabled_with_write_lock_contended_falls_back_to_raw() {
    // While `cleanup_init` is in flight it holds the write lock. The
    // audio thread must NOT deadlock waiting for the write lock to
    // release; instead it returns raw for this one decode and tries
    // again on the next.
    let state: CleanupState = Arc::new(RwLock::new(None));
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let _guard = rt.block_on(async { state.write().await });

    let mut settings = get_default_settings();
    settings.cleanup_enabled = true;

    let out = cleanup_or_filter(
        "decode happens during init",
        &state,
        &settings,
        CleanupContext::default,
    );
    assert_eq!(
        out, "decode happens during init",
        "audio thread must not block on cleanup init"
    );
}

/// Model-gated end-to-end: load the real Qwen GGUF cleanup model and run
/// one cleanup pass through the public helper. Off by default to keep
/// CI / `cargo test` fast.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "downloads ~900MB GGUF; set ECHO_CLEANUP_RUN_MODEL_TESTS=1 to enable"]
async fn cleanup_enabled_with_loaded_model_returns_cleaned_text() {
    if std::env::var("ECHO_CLEANUP_RUN_MODEL_TESTS").is_err() {
        eprintln!("SKIP: ECHO_CLEANUP_RUN_MODEL_TESTS not set");
        return;
    }
    use echo_app_lib::managers::cleanup::CleanupManager;

    let model_dir = {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        #[cfg(target_os = "macos")]
        {
            std::path::PathBuf::from(home).join("Library/Application Support/echo/models/cleanup")
        }
        #[cfg(not(target_os = "macos"))]
        {
            std::path::PathBuf::from(home).join(".local/share/echo/models/cleanup")
        }
    };

    let mgr = match CleanupManager::init(model_dir, "qwen2.5-1.5b-instruct-q4_k_m").await {
        Ok(m) => m,
        Err(e) => {
            eprintln!("SKIP: model unavailable: {e:#}");
            return;
        }
    };

    let state: CleanupState = Arc::new(RwLock::new(Some(mgr)));
    let mut settings = get_default_settings();
    settings.cleanup_enabled = true;

    let raw = "um so I uh wanted to like say hello there";
    // `cleanup_or_filter` is sync (intended for spawn_blocking contexts);
    // running it from a multi-thread tokio test still works because the
    // inner `clean_blocking` uses `tauri::async_runtime::block_on`.
    let out = tokio::task::spawn_blocking({
        let state = state.clone();
        move || cleanup_or_filter(raw, &state, &settings, CleanupContext::default)
    })
    .await
    .expect("spawn_blocking should join");

    assert!(!out.is_empty(), "cleanup must not drop real speech");
    // The exact output depends on the model, but disfluency tokens
    // should be reduced — at minimum, the result should NOT be the raw
    // input verbatim.
    assert_ne!(out, raw, "cleanup must produce a different string");
}
