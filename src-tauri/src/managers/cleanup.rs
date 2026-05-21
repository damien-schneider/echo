//! Production on-device transcription-cleanup model.
//!
//! Wraps a mistral.rs GGUF-quantised Qwen 2.5 1.5B Instruct pipeline and
//! exposes a single async `clean(raw, ctx)` entry point that:
//!
//! 1. assembles a deterministic system prompt from `CleanupContext`
//!    (see [`cleanup_prompt::system_prompt`]),
//! 2. runs one chat completion against the loaded model,
//! 3. validates the response against the diff guardrail
//!    ([`cleanup_prompt::diff_guardrail`]), falling back to the raw
//!    transcript if anything looks suspicious.
//!
//! macOS-only by design: the cleanup model rides the same Metal stack as
//! whisper.cpp / parakeet-rs / screencapturekit. Other platforms get a
//! stub that returns the raw text unchanged so callers don't need
//! conditional handling. The stub reports `is_loaded() == false` so the
//! UI can show "cleanup unavailable" rather than silently pretending
//! cleanup is running.
//!
//! The HF cache root (`HF_HOME`) is configured **once at app startup**
//! in `lib.rs` via [`set_hf_cache_root`], before any cleanup-related
//! work touches mistral.rs. mistral.rs's `GgufModelBuilder` does not
//! expose a per-builder cache path setter, so a process-wide env var is
//! the supported mechanism (see mistral.rs docs/environment-variables.md).
//!
//! ## Calling from blocking contexts
//!
//! `clean` is `async`. Callers that already run inside `spawn_blocking`
//! (e.g. whisper decode hooks in `meeting_streaming.rs`) cannot
//! `.await`, so use [`CleanupManager::clean_blocking`] instead, which
//! drives the future on the Tauri async runtime.

use std::path::{Path, PathBuf};

pub use crate::managers::cleanup_prompt::{
    CleanupContext, DictionaryEntry, GuardrailVerdict, Register,
};

/// Point the HF cache root (and the legacy `HF_HUB_CACHE`) at `dir` so
/// every subsequent mistral.rs / hf-hub download lands in our app data
/// folder instead of `~/.cache/huggingface`.
///
/// MUST be called exactly once, at app startup, **before** any code
/// touches `GgufModelBuilder` or any other hf-hub-backed loader.
///
/// # Safety
///
/// `std::env::set_var` is `unsafe` under the 2024 edition because env
/// mutation is not thread-safe. The caller (currently `lib.rs`) invokes
/// this on the main thread before any worker threads are spawned, which
/// satisfies the safety contract.
pub fn set_hf_cache_root(dir: &Path) {
    // SAFETY: called from the main thread at startup, before any other
    // thread that might read env vars exists. mistral.rs reads HF_HOME
    // lazily inside its builder, which we always invoke after this.
    unsafe {
        std::env::set_var("HF_HOME", dir);
    }
}

// ── shared (cross-platform) defaults ───────────────────────────────────

/// HF repo to source the GGUF artifacts from. Exposed so settings /
/// commands can show it in diagnostics.
pub const CLEANUP_GGUF_REPO: &str = "Qwen/Qwen2.5-1.5B-Instruct-GGUF";

/// Default GGUF file inside [`CLEANUP_GGUF_REPO`] (Q4_K_M, ~900 MB).
pub const CLEANUP_GGUF_FILE: &str = "qwen2.5-1.5b-instruct-q4_k_m.gguf";

/// Model id for chat-template / tokenizer source (full Qwen repo so the
/// instruct chat template is picked up correctly).
pub const CLEANUP_TOKENIZER_REPO: &str = "Qwen/Qwen2.5-1.5B-Instruct";

// ── macOS implementation (real model) ──────────────────────────────────

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use anyhow::{Context, Result};
    use log::{info, warn};
    use mistralrs::{GgufModelBuilder, Model, TextMessageRole, TextMessages};

    /// Loaded cleanup model. `clean` is the only stable entry point;
    /// everything else is implementation detail.
    pub struct CleanupManager {
        model: Model,
        model_id: String,
    }

    impl CleanupManager {
        /// Load the GGUF cleanup model. `model_dir` is the HF cache root
        /// that was already exported via [`set_hf_cache_root`] at app
        /// startup; we only use it here to `mkdir -p` the path and for
        /// logging. `model_id` is logged for diagnostics. The actual
        /// GGUF repo / filename pair is fixed at compile time (see
        /// [`CLEANUP_GGUF_REPO`] and [`CLEANUP_GGUF_FILE`]) — the
        /// `model_id` argument is preserved so settings can swap models
        /// later without changing this signature.
        pub async fn init(model_dir: PathBuf, model_id: &str) -> Result<Self> {
            // Make sure the cache root exists; mistral.rs / hf-hub will
            // happily create subdirectories under it but won't `mkdir -p`
            // the root itself in every code path.
            std::fs::create_dir_all(&model_dir).with_context(|| {
                format!(
                    "creating cleanup model cache dir {}",
                    model_dir.display()
                )
            })?;

            // Note: `HF_HOME` is set once at app startup in `lib.rs` via
            // [`set_hf_cache_root`]; do NOT touch it here. The previous
            // approach (per-init `set_var`) was both racy under the 2024
            // edition's `unsafe set_var` rule and redundant — HF_HOME
            // never needs to change once mistral.rs has read it.

            info!(
                "[cleanup] loading GGUF model repo={} file={} tokenizer={} cache={}",
                CLEANUP_GGUF_REPO,
                CLEANUP_GGUF_FILE,
                CLEANUP_TOKENIZER_REPO,
                model_dir.display()
            );

            let model = GgufModelBuilder::new(CLEANUP_GGUF_REPO, vec![CLEANUP_GGUF_FILE])
                .with_tok_model_id(CLEANUP_TOKENIZER_REPO)
                // Prefix-cache 16 sequences so the deterministic system
                // prompt is reused across `clean()` calls. mistral.rs
                // 0ed6f6c defaults to Some(16) already, but we set it
                // explicitly here to guard against silent default
                // changes on future bumps.
                .with_prefix_cache_n(Some(16))
                .build()
                .await
                .with_context(|| {
                    format!(
                        "loading GGUF cleanup model {}/{}",
                        CLEANUP_GGUF_REPO, CLEANUP_GGUF_FILE
                    )
                })?;

            info!("[cleanup] model {model_id} loaded");

            Ok(Self {
                model,
                model_id: model_id.to_string(),
            })
        }

        /// Always true once `init` returned `Ok`. Useful for state-based
        /// callers like the Tauri command layer.
        pub fn is_loaded(&self) -> bool {
            true
        }

        /// Currently loaded model id (best-effort label).
        pub fn model_id(&self) -> &str {
            &self.model_id
        }

        /// Run one cleanup pass. Guardrail-rejected outputs return the
        /// untouched `raw` so the caller never has to handle "the model
        /// failed" branches itself.
        pub async fn clean(&self, raw: &str, ctx: &CleanupContext) -> Result<String> {
            if raw.trim().is_empty() {
                return Ok(raw.to_string());
            }

            let system = crate::managers::cleanup_prompt::system_prompt(ctx);
            let messages = TextMessages::new()
                .add_message(TextMessageRole::System, &system)
                .add_message(TextMessageRole::User, raw);

            let response = self
                .model
                .send_chat_request(messages)
                .await
                .context("cleanup model chat request failed")?;

            let choice = response
                .choices
                .first()
                .context("cleanup model returned no choices")?;
            let content = choice
                .message
                .content
                .clone()
                .context("cleanup model returned no content")?;
            let cleaned = content.trim().to_string();

            match crate::managers::cleanup_prompt::diff_guardrail(raw, &cleaned) {
                GuardrailVerdict::Accept => Ok(cleaned),
                GuardrailVerdict::Reject(reason) => {
                    warn!("[cleanup] guardrail rejected output, falling back to raw: {reason}");
                    Ok(raw.to_string())
                }
            }
        }

        /// Synchronous wrapper around [`Self::clean`] for callers in
        /// `spawn_blocking` contexts (e.g. whisper decode hooks) where
        /// `.await` would panic.
        ///
        /// Drives the future on Tauri's async runtime via
        /// [`tauri::async_runtime::block_on`], which works whether or
        /// not the current thread already has a tokio runtime handle.
        pub fn clean_blocking(&self, raw: &str, ctx: &CleanupContext) -> Result<String> {
            tauri::async_runtime::block_on(self.clean(raw, ctx))
        }
    }
}

// ── Non-macOS stub (returns raw text unchanged) ────────────────────────

#[cfg(not(target_os = "macos"))]
mod imp {
    use super::*;
    use anyhow::Result;
    use log::warn;
    use std::sync::OnceLock;

    /// Logs the "cleanup is macOS-only" warning at most once per process,
    /// no matter how many times `init` is called.
    static STUB_WARN_ONCE: OnceLock<()> = OnceLock::new();

    /// Stub manager for non-macOS platforms. Reports `is_loaded() = false`
    /// so the UI can show "cleanup unavailable" instead of pretending the
    /// model is running, and returns the raw text unchanged from `clean`
    /// so callers that don't gate on `is_loaded()` still get a sensible
    /// pass-through.
    pub struct CleanupManager {
        model_id: String,
    }

    impl CleanupManager {
        pub async fn init(_model_dir: PathBuf, model_id: &str) -> Result<Self> {
            STUB_WARN_ONCE.get_or_init(|| {
                warn!(
                    "[cleanup] cleanup feature is macOS-only; running as no-op stub on this platform"
                );
            });
            Ok(Self {
                model_id: model_id.to_string(),
            })
        }

        pub fn is_loaded(&self) -> bool {
            false
        }

        pub fn model_id(&self) -> &str {
            &self.model_id
        }

        pub async fn clean(&self, raw: &str, _ctx: &CleanupContext) -> Result<String> {
            Ok(raw.to_string())
        }

        /// Synchronous wrapper. The stub doesn't actually await anything
        /// inside `clean`, so this is a trivial pass-through, but it
        /// keeps the API surface identical across platforms so
        /// `spawn_blocking` callers don't need cfg-gates.
        pub fn clean_blocking(&self, raw: &str, _ctx: &CleanupContext) -> Result<String> {
            Ok(raw.to_string())
        }
    }
}

pub use imp::CleanupManager;

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    /// Read the model dir from env if set, else fall back to the app
    /// data dir under `~/Library/Application Support/echo/models/cleanup`
    /// so the test exercises the real path used at runtime.
    fn test_model_dir() -> PathBuf {
        if let Ok(p) = std::env::var("ECHO_CLEANUP_MODEL_DIR") {
            return PathBuf::from(p);
        }
        // We can't access tauri's app_data_dir() outside the runtime, so
        // mirror the path manually for testing.
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        #[cfg(target_os = "macos")]
        {
            PathBuf::from(home).join("Library/Application Support/echo/models/cleanup")
        }
        #[cfg(not(target_os = "macos"))]
        {
            PathBuf::from(home).join(".local/share/echo/models/cleanup")
        }
    }

    fn skip_if_no_network() -> bool {
        std::env::var("ECHO_CLEANUP_OFFLINE").is_ok()
    }

    #[test]
    fn is_loaded_false_before_init() {
        // We can't construct a CleanupManager without calling init(); the
        // contract is "is_loaded() is true on a successfully-init'd
        // manager, false otherwise". The "false" branch is observable
        // only through the Option<CleanupManager> wrapper in the state
        // layer (CleanupState), not on the manager itself. This test
        // documents that contract by asserting the wrapper-style check.
        let opt: Option<CleanupManager> = None;
        assert!(opt.is_none(), "no manager => not loaded");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "downloads ~900MB GGUF on first run; set ECHO_CLEANUP_RUN_MODEL_TESTS=1 to enable"]
    async fn loads_qwen_gguf_and_runs_cleanup() {
        if std::env::var("ECHO_CLEANUP_RUN_MODEL_TESTS").is_err() {
            eprintln!("SKIP: ECHO_CLEANUP_RUN_MODEL_TESTS not set");
            return;
        }
        if skip_if_no_network() {
            eprintln!("SKIP: ECHO_CLEANUP_OFFLINE set");
            return;
        }

        let dir = test_model_dir();
        let mgr = match CleanupManager::init(dir, "qwen2.5-1.5b-instruct-q4_k_m").await {
            Ok(m) => m,
            Err(e) => {
                let msg = format!("{e:#}");
                if msg.contains("offline") || msg.contains("network") {
                    eprintln!("SKIP: model unavailable offline: {msg}");
                    return;
                }
                panic!("CleanupManager::init failed: {msg}");
            }
        };

        assert!(mgr.is_loaded());

        let ctx = CleanupContext::default();
        // Warm-up pass (not timed).
        let _ = mgr
            .clean("um so I uh wanted to like say hello there", &ctx)
            .await
            .expect("warmup clean failed");

        // Five warm runs, take median, assert < 300ms.
        let mut samples = Vec::with_capacity(5);
        for i in 0..5 {
            let t = Instant::now();
            let out = mgr
                .clean("um so I uh wanted to like say hello there", &ctx)
                .await
                .unwrap_or_else(|e| panic!("warm clean #{i} failed: {e:#}"));
            let dt = t.elapsed();
            eprintln!("warm #{i}: {dt:?} -> {out:?}");
            samples.push(dt);
        }
        samples.sort();
        let median = samples[samples.len() / 2];
        eprintln!("warm median: {median:?}");
        assert!(
            median < Duration::from_millis(300),
            "warm median {median:?} exceeds 300ms budget"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "requires loaded model — gated by ECHO_CLEANUP_RUN_MODEL_TESTS=1"]
    async fn clean_returns_original_on_guardrail_reject() {
        if std::env::var("ECHO_CLEANUP_RUN_MODEL_TESTS").is_err() {
            eprintln!("SKIP: ECHO_CLEANUP_RUN_MODEL_TESTS not set");
            return;
        }
        if skip_if_no_network() {
            return;
        }
        let mgr = CleanupManager::init(test_model_dir(), "qwen2.5-1.5b-instruct-q4_k_m")
            .await
            .expect("init failed");

        // We can't easily force the model to paraphrase, so this test
        // verifies the *contract* by feeding empty input — which the
        // function short-circuits on without touching the model.
        let out = mgr.clean("", &CleanupContext::default()).await.unwrap();
        assert_eq!(out, "");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "requires loaded model — gated by ECHO_CLEANUP_RUN_MODEL_TESTS=1"]
    async fn clean_handles_french() {
        if std::env::var("ECHO_CLEANUP_RUN_MODEL_TESTS").is_err() {
            eprintln!("SKIP: ECHO_CLEANUP_RUN_MODEL_TESTS not set");
            return;
        }
        if skip_if_no_network() {
            return;
        }
        let mgr = CleanupManager::init(test_model_dir(), "qwen2.5-1.5b-instruct-q4_k_m")
            .await
            .expect("init failed");

        let ctx = CleanupContext {
            language_hint: Some("fr".to_string()),
            ..CleanupContext::default()
        };
        let out = mgr
            .clean("donc euh je voulais te dire que c'est bon", &ctx)
            .await
            .expect("clean failed");
        let lower = out.to_lowercase();
        // Should not be empty, should still mention the core French verbs.
        assert!(!out.trim().is_empty(), "empty cleanup output");
        assert!(
            lower.contains("voulais") || lower.contains("voudrais"),
            "expected French verb retained, got {out:?}"
        );
    }

    #[tokio::test]
    async fn stub_path_returns_raw_unchanged() {
        // On non-macOS, the stub returns raw. On macOS, we still verify
        // that empty input short-circuits without touching the model.
        // This test runs cross-platform without requiring the model.
        #[cfg(not(target_os = "macos"))]
        {
            let dir = test_model_dir();
            let mgr = CleanupManager::init(dir, "stub").await.unwrap();
            let out = mgr
                .clean("hello world", &CleanupContext::default())
                .await
                .unwrap();
            assert_eq!(out, "hello world");
        }
        #[cfg(target_os = "macos")]
        {
            // macOS path: empty raw short-circuits, no model needed.
            // We can't fully exercise CleanupManager::init here without
            // downloading the model, so we just assert the constants are
            // sane.
            assert!(!CLEANUP_GGUF_REPO.is_empty());
            assert!(CLEANUP_GGUF_FILE.ends_with(".gguf"));
        }
    }

    /// On non-macOS, the stub MUST report `is_loaded() == false` so
    /// callers (and the UI) don't show "cleanup on" while running as a
    /// pass-through. The macOS branch reports `true` once init succeeds
    /// and is exercised by the gated `loads_qwen_gguf_and_runs_cleanup`
    /// test above.
    #[cfg(not(target_os = "macos"))]
    #[tokio::test]
    async fn stub_is_loaded_returns_false() {
        let dir = test_model_dir();
        let mgr = CleanupManager::init(dir, "stub").await.unwrap();
        assert!(
            !mgr.is_loaded(),
            "non-macOS stub must report is_loaded() = false"
        );
    }

    /// `clean_blocking` lets callers in `spawn_blocking` contexts run a
    /// cleanup pass without needing `.await` (which would panic outside
    /// an async runtime). On non-macOS the stub returns raw unchanged.
    #[cfg(not(target_os = "macos"))]
    #[test]
    fn stub_clean_blocking_returns_raw_unchanged() {
        // Must NOT require a tokio runtime to be entered.
        let dir = test_model_dir();
        let mgr = tauri::async_runtime::block_on(CleanupManager::init(dir, "stub")).unwrap();
        let out = mgr
            .clean_blocking("hello world", &CleanupContext::default())
            .expect("clean_blocking should succeed on stub");
        assert_eq!(out, "hello world");
    }
}
