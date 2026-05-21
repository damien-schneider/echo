//! Tauri commands for the on-device cleanup model.
//!
//! Three commands are exposed to the frontend:
//!
//! - `cleanup_init` — lazy-load the model from
//!   `app_data_dir/models/cleanup`. Idempotent: a second call while a
//!   manager is already loaded is a no-op.
//! - `cleanup_test` — run one cleanup pass with the current settings'
//!   dictionary / register, useful for the settings panel "Try it" box.
//! - `cleanup_is_loaded` — quick boolean for the UI to show a spinner.
//!
//! The manager is held in a `tokio::sync::RwLock<Option<CleanupManager>>`
//! and registered as Tauri-managed state on startup.

use log::{error, info};
use std::future::Future;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::RwLock;

use crate::managers::app_context::{
    classify_register, FocusedAppProvider, PlatformFocusedAppProvider,
};
use crate::managers::cleanup::CleanupManager;
use crate::managers::cleanup_prompt::{
    CleanupContext, DictionaryEntry, Register,
};
use crate::settings::{self, DictionaryEntrySetting};

/// Shared mutable state holding the currently-loaded manager (if any).
/// Held behind `RwLock` so multiple `cleanup_test` calls can run their
/// async inference in parallel against a single loaded model.
pub type CleanupState = Arc<RwLock<Option<CleanupManager>>>;

/// Build a [`CleanupState`] suitable for `app.manage()` at startup.
pub fn new_state() -> CleanupState {
    Arc::new(RwLock::new(None))
}

fn dictionary_from_settings(entries: &[DictionaryEntrySetting]) -> Vec<DictionaryEntry> {
    entries
        .iter()
        .map(|e| DictionaryEntry {
            canonical: e.canonical.clone(),
            variants: e.variants.clone(),
        })
        .collect()
}

/// Default register when no app-context signal is available.
fn default_register() -> Register {
    Register::Neutral
}

/// Build a [`CleanupContext`] from an already-resolved [`AppSettings`]
/// snapshot. Thin wrapper around
/// [`build_context_from_app_settings_with_provider`] that uses the real
/// per-platform focused-app probe. Existing callers (`actions.rs`,
/// `meeting.rs`, `meeting_streaming.rs`, `cleanup_test`) keep this
/// signature so they automatically pick up Phase-3 app awareness.
pub fn build_context_from_app_settings(s: &crate::settings::AppSettings) -> CleanupContext {
    build_context_from_app_settings_with_provider(s, &PlatformFocusedAppProvider)
}

/// Provider-injecting variant. Pure logic — no Tauri / Cocoa / Win32 in
/// the body — so it can be unit-tested with a mock provider.
///
/// Behavior:
///  * `cleanup_app_context_enabled = false` → no provider call, leaves
///    `app_name = None` and `app_register = Neutral`.
///  * Provider returns `None` (Linux, lookup failed) → same defaults.
///  * Provider returns `Some(app)` → `app_name` derived from the app's
///    localized name (fallback: bundle id), `app_register` derived from
///    `classify_register`.
pub fn build_context_from_app_settings_with_provider(
    s: &crate::settings::AppSettings,
    provider: &dyn FocusedAppProvider,
) -> CleanupContext {
    let language_hint = if s.selected_language == "auto" {
        None
    } else {
        Some(s.selected_language.clone())
    };

    let (app_register, app_name) = if s.cleanup_app_context_enabled {
        match provider.current() {
            Some(app) => {
                let reg = classify_register(&app);
                let name = app
                    .process_name
                    .clone()
                    .or_else(|| app.bundle_id.clone());
                (reg, name)
            }
            None => (default_register(), None),
        }
    } else {
        (default_register(), None)
    };

    CleanupContext {
        dictionary: dictionary_from_settings(&s.cleanup_dictionary),
        app_register,
        app_name,
        language_hint,
    }
}

fn build_context_from_settings(app: &AppHandle) -> CleanupContext {
    let s = settings::get_settings(app);
    build_context_from_app_settings(&s)
}

/// Lazily populate an `Arc<RwLock<Option<T>>>` exactly once across
/// concurrent callers.
///
/// Avoids the TOCTOU race where two callers both observe `None` under
/// the cheap read lock, both run the slow `loader`, and the second
/// overwrites the first. The pattern is:
///
/// 1. Fast-path read lock check — return immediately if already loaded.
/// 2. Acquire the write lock and re-check (double-check). If still
///    `None`, run `loader` *while holding the write lock* and store the
///    result. Concurrent callers queue on the write lock; when they
///    finally acquire it the re-check trips and they return.
///
/// Holding the write lock across `loader().await` (~900 MB model load)
/// is acceptable here because the lock guards a single
/// `Option<CleanupManager>` that is normally written exactly once at
/// app boot. Other readers (e.g. `cleanup_test`) only need the read
/// lock and they happily wait for init to finish anyway.
async fn init_state_once<T, F, Fut, E>(
    state: &Arc<RwLock<Option<T>>>,
    loader: F,
) -> Result<(), E>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T, E>>,
{
    // Fast path: already loaded.
    {
        let read = state.read().await;
        if read.is_some() {
            return Ok(());
        }
    }

    // Slow path: acquire write lock first, re-check, then run the
    // loader serialised. This guarantees `loader` runs at most once.
    let mut write = state.write().await;
    if write.is_some() {
        return Ok(());
    }
    let value = loader().await?;
    *write = Some(value);
    Ok(())
}

#[tauri::command]
pub async fn cleanup_init(app: AppHandle, state: State<'_, CleanupState>) -> Result<(), String> {
    // Fast path: already loaded (avoids resolving app_data_dir / settings).
    {
        let read = state.read().await;
        if read.is_some() {
            return Ok(());
        }
    }

    let model_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?
        .join("models")
        .join("cleanup");

    let model_id = settings::get_settings(&app).cleanup_model_id;
    info!(
        "[cleanup] init requested: model_id={} dir={}",
        model_id,
        model_dir.display()
    );

    let state_arc: Arc<RwLock<Option<CleanupManager>>> = state.inner().clone();
    init_state_once(&state_arc, || async move {
        let mgr = CleanupManager::init(model_dir, &model_id)
            .await
            .map_err(|e| {
                error!("[cleanup] init failed: {e:#}");
                format!("Failed to init cleanup model: {e:#}")
            })?;
        info!("[cleanup] manager ready");
        Ok::<_, String>(mgr)
    })
    .await
}

#[tauri::command]
pub async fn cleanup_test(
    app: AppHandle,
    state: State<'_, CleanupState>,
    raw: String,
) -> Result<String, String> {
    let read = state.read().await;
    let mgr = read
        .as_ref()
        .ok_or_else(|| "Cleanup model not initialized. Call cleanup_init first.".to_string())?;
    let ctx = build_context_from_settings(&app);
    mgr.clean(&raw, &ctx).await.map_err(|e| {
        error!("[cleanup] clean failed: {e:#}");
        format!("Cleanup failed: {e:#}")
    })
}

#[tauri::command]
pub async fn cleanup_is_loaded(state: State<'_, CleanupState>) -> Result<bool, String> {
    Ok(state.read().await.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::managers::app_context::{FocusedApp, FocusedAppProvider};
    use crate::settings::get_default_settings;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Test double for `FocusedAppProvider` that returns a canned
    /// `FocusedApp` (or `None`). Used to drive
    /// `build_context_from_app_settings_with_provider` without poking at
    /// the real OS.
    struct MockProvider {
        app: Option<FocusedApp>,
    }
    impl FocusedAppProvider for MockProvider {
        fn current(&self) -> Option<FocusedApp> {
            self.app.clone()
        }
    }

    fn slack_provider() -> MockProvider {
        MockProvider {
            app: Some(FocusedApp {
                bundle_id: Some("com.tinyspeck.slackmacgap".to_string()),
                process_name: Some("Slack".to_string()),
                window_title: None,
            }),
        }
    }

    #[test]
    fn build_context_uses_provider_when_app_context_enabled() {
        let mut s = get_default_settings();
        s.cleanup_app_context_enabled = true;
        let provider = slack_provider();
        let ctx = build_context_from_app_settings_with_provider(&s, &provider);
        assert_eq!(ctx.app_register, Register::Casual);
        assert_eq!(ctx.app_name.as_deref(), Some("Slack"));
    }

    #[test]
    fn build_context_ignores_provider_when_app_context_disabled() {
        let mut s = get_default_settings();
        s.cleanup_app_context_enabled = false;
        let provider = slack_provider();
        let ctx = build_context_from_app_settings_with_provider(&s, &provider);
        assert_eq!(ctx.app_register, Register::Neutral);
        assert_eq!(ctx.app_name, None);
    }

    #[test]
    fn build_context_falls_back_when_provider_returns_none() {
        let mut s = get_default_settings();
        s.cleanup_app_context_enabled = true;
        let provider = MockProvider { app: None };
        let ctx = build_context_from_app_settings_with_provider(&s, &provider);
        assert_eq!(ctx.app_register, Register::Neutral);
        assert_eq!(ctx.app_name, None);
    }

    #[test]
    fn new_state_starts_empty() {
        let s = new_state();
        // Sync inspection: can only be acquired in a blocking context.
        let blocking = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap();
        blocking.block_on(async {
            assert!(s.read().await.is_none(), "state must start empty");
        });
    }

    #[test]
    fn dictionary_from_settings_preserves_entries() {
        let settings_entries = vec![
            DictionaryEntrySetting {
                canonical: "Echo".to_string(),
                variants: vec!["eko".to_string()],
            },
            DictionaryEntrySetting {
                canonical: "Damien".to_string(),
                variants: Vec::new(),
            },
        ];
        let mapped = dictionary_from_settings(&settings_entries);
        assert_eq!(mapped.len(), 2);
        assert_eq!(mapped[0].canonical, "Echo");
        assert_eq!(mapped[0].variants, vec!["eko"]);
        assert_eq!(mapped[1].canonical, "Damien");
        assert!(mapped[1].variants.is_empty());
    }

    #[test]
    fn default_register_is_neutral() {
        assert_eq!(default_register(), Register::Neutral);
    }

    /// TOCTOU regression test: two concurrent callers must trigger the
    /// loader exactly once, never twice. Without the double-check inside
    /// the write lock, both readers would observe `None`, both would run
    /// the loader, and the second would overwrite the first's manager.
    #[test]
    fn init_state_once_runs_loader_exactly_once_under_concurrency() {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()
            .unwrap();

        rt.block_on(async {
            let state: Arc<RwLock<Option<String>>> = Arc::new(RwLock::new(None));
            let counter = Arc::new(AtomicUsize::new(0));

            // Spawn N concurrent init attempts; loader sleeps briefly to
            // maximise the chance that all callers observe `None` in the
            // fast-path read lock.
            let mut handles = Vec::new();
            for _ in 0..8 {
                let state = state.clone();
                let counter = counter.clone();
                handles.push(tokio::spawn(async move {
                    init_state_once(&state, || {
                        let counter = counter.clone();
                        async move {
                            counter.fetch_add(1, Ordering::SeqCst);
                            // Simulate slow model load so concurrent
                            // readers race past the fast-path check.
                            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
                            Ok::<String, String>("loaded".to_string())
                        }
                    })
                    .await
                }));
            }
            for h in handles {
                h.await.unwrap().expect("init_state_once should succeed");
            }

            assert_eq!(
                counter.load(Ordering::SeqCst),
                1,
                "loader must run exactly once across concurrent init calls"
            );
            assert!(state.read().await.is_some(), "state must be populated");
        });
    }

    /// Sequential idempotency: a second call with state already populated
    /// is a no-op and does NOT invoke the loader.
    #[test]
    fn init_state_once_second_call_is_noop() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        rt.block_on(async {
            let state: Arc<RwLock<Option<String>>> = Arc::new(RwLock::new(None));
            let counter = Arc::new(AtomicUsize::new(0));

            for _ in 0..3 {
                let counter = counter.clone();
                init_state_once(&state, || {
                    let counter = counter.clone();
                    async move {
                        counter.fetch_add(1, Ordering::SeqCst);
                        Ok::<String, String>("loaded".to_string())
                    }
                })
                .await
                .expect("init_state_once should succeed");
            }
            assert_eq!(counter.load(Ordering::SeqCst), 1);
        });
    }
}
