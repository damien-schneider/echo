//! Lightweight deterministic transcript cleanup; model benchmarks live outside production.

use anyhow::Result;
use std::path::PathBuf;

pub use crate::managers::cleanup_prompt::{
    CleanupContext, DictionaryEntry, GuardrailVerdict, Register,
};

pub const fn cleanup_runtime_enabled() -> bool {
    false
}

pub struct CleanupManager {
    model_id: String,
}

impl CleanupManager {
    pub async fn init(_model_dir: PathBuf, model_id: &str) -> Result<Self> {
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

    pub fn clean_blocking(&self, raw: &str, _ctx: &CleanupContext) -> Result<String> {
        Ok(raw.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qwen_runtime_is_not_enabled_in_production() {
        assert!(!cleanup_runtime_enabled());
    }

    #[tokio::test]
    async fn cleanup_manager_is_a_non_loading_passthrough() {
        let manager = CleanupManager::init(PathBuf::new(), "benchmark-only")
            .await
            .expect("create cleanup manager");

        assert!(!manager.is_loaded());
        assert_eq!(manager.model_id(), "benchmark-only");
        assert_eq!(
            manager
                .clean("raw transcript", &CleanupContext::default())
                .await
                .expect("passthrough cleanup"),
            "raw transcript"
        );
    }
}
