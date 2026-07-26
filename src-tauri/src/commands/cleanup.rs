//! Context assembly and shared state for deterministic transcript cleanup.

#[cfg(test)]
use std::future::Future;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::managers::app_context::{
    classify_register, FocusedAppProvider, PlatformFocusedAppProvider,
};
use crate::managers::cleanup::CleanupManager;
use crate::managers::cleanup_prompt::{CleanupContext, DictionaryEntry, Register};
use crate::settings::DictionaryEntrySetting;

pub type CleanupState = Arc<RwLock<Option<CleanupManager>>>;

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

fn default_register() -> Register {
    Register::Neutral
}

pub fn build_context_from_app_settings(s: &crate::settings::AppSettings) -> CleanupContext {
    build_context_from_app_settings_with_provider(s, &PlatformFocusedAppProvider)
}

/// Provider-injecting; pure for unit tests.
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
                let name = app.process_name.clone().or_else(|| app.bundle_id.clone());
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

/// Double-check write-lock pattern; loader runs at most once across concurrent callers.
#[cfg(test)]
async fn init_state_once<T, F, Fut, E>(state: &Arc<RwLock<Option<T>>>, loader: F) -> Result<(), E>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T, E>>,
{
    {
        let read = state.read().await;
        if read.is_some() {
            return Ok(());
        }
    }

    let mut write = state.write().await;
    if write.is_some() {
        return Ok(());
    }
    let value = loader().await?;
    *write = Some(value);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::managers::app_context::{FocusedApp, FocusedAppProvider};
    use crate::settings::get_default_settings;
    use std::sync::atomic::{AtomicUsize, Ordering};

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

    /// TOCTOU regression — loader runs once across concurrent callers.
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

            // Loader sleeps so all callers race past the fast-path read.
            let mut handles = Vec::new();
            for _ in 0..8 {
                let state = state.clone();
                let counter = counter.clone();
                handles.push(tokio::spawn(async move {
                    init_state_once(&state, || {
                        let counter = counter.clone();
                        async move {
                            counter.fetch_add(1, Ordering::SeqCst);
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
