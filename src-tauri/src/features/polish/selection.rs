use anyhow::{Context, Result};
use async_trait::async_trait;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

mod copy_wait;

use super::policy::{validate_polish_input, validated_polish_output};
use copy_wait::copy_poll_delays;

const MAX_POLISH_TOKENS: usize = 1_500;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ClipboardFormat {
    pub(super) name: String,
    pub(super) data: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ClipboardSnapshot {
    pub(super) formats: Vec<ClipboardFormat>,
}

pub(super) trait ClipboardPort: Send + Sync {
    fn snapshot(&self) -> Result<ClipboardSnapshot>;
    fn read_text(&self) -> Result<String>;
    fn write_text(&self, text: &str) -> Result<()>;
    fn restore(&self, snapshot: &ClipboardSnapshot) -> Result<()>;
}

pub(super) trait KeyboardPort: Send + Sync {
    fn copy(&self) -> Result<()>;
    fn paste(&self) -> Result<()>;
}

pub(super) trait FocusPort: Send + Sync {
    fn focused_application(&self) -> Option<String>;
}

#[async_trait]
pub(super) trait InferencePort: Send + Sync {
    async fn token_count(&self, text: &str) -> Result<usize>;
    async fn polish(&self, text: &str) -> Result<String>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SelectionMode {
    ReplaceSelection,
    ClipboardOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PolishOutcome {
    Replaced,
    Copied,
    Unchanged,
    NoSelection,
}

pub(super) struct CapturedPolishInput {
    text: String,
    focused_application: Option<String>,
    mode: SelectionMode,
}

#[derive(Default)]
pub(super) struct CancellationClock {
    generation: AtomicU64,
    commit_gate: Mutex<()>,
}

impl CancellationClock {
    pub(super) fn begin(&self) -> u64 {
        let _guard = self.commit_gate.lock().ok();
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub(super) fn cancel(&self) {
        let _guard = self.commit_gate.lock().ok();
        self.generation.fetch_add(1, Ordering::SeqCst);
    }

    fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == generation
    }

    fn commit_if_current<T>(
        &self,
        generation: u64,
        operation: impl FnOnce() -> Result<T>,
    ) -> Result<T> {
        let _guard = self
            .commit_gate
            .lock()
            .map_err(|_| anyhow::anyhow!("Polish commit lock is poisoned"))?;
        if !self.is_current(generation) {
            anyhow::bail!("Polish request was cancelled");
        }
        operation()
    }
}

pub(super) struct PolishTransactionPorts {
    pub(super) clipboard: Arc<dyn ClipboardPort>,
    pub(super) keyboard: Arc<dyn KeyboardPort>,
    pub(super) focus: Arc<dyn FocusPort>,
    pub(super) inference: Arc<dyn InferencePort>,
    pub(super) cancellation: Arc<CancellationClock>,
}

pub(super) struct PolishTransaction {
    ports: PolishTransactionPorts,
}

impl PolishTransaction {
    pub(super) fn new(ports: PolishTransactionPorts) -> Self {
        Self { ports }
    }

    #[cfg(test)]
    async fn run(&self, mode: SelectionMode, generation: u64) -> Result<PolishOutcome> {
        let Some(captured) = self.capture(mode, generation).await? else {
            return Ok(PolishOutcome::NoSelection);
        };
        self.complete(captured, generation).await
    }

    pub(super) async fn capture(
        &self,
        mode: SelectionMode,
        generation: u64,
    ) -> Result<Option<CapturedPolishInput>> {
        self.ensure_current(generation)?;
        let focused_application = self.ports.focus.focused_application();
        let input = match mode {
            SelectionMode::ReplaceSelection => match self.capture_selection(generation).await? {
                Some(input) => input,
                None => return Ok(None),
            },
            SelectionMode::ClipboardOnly => self.ports.clipboard.read_text()?,
        };
        if input.trim().is_empty() {
            return Ok(None);
        }
        validate_polish_input(&input)?;
        Ok(Some(CapturedPolishInput {
            text: input,
            focused_application,
            mode,
        }))
    }

    pub(super) async fn complete(
        &self,
        captured: CapturedPolishInput,
        generation: u64,
    ) -> Result<PolishOutcome> {
        self.ensure_current(generation)?;
        if self.ports.inference.token_count(&captured.text).await? > MAX_POLISH_TOKENS {
            anyhow::bail!("Selection exceeds {MAX_POLISH_TOKENS} tokens");
        }
        self.ensure_current(generation)?;
        let output = self.ports.inference.polish(&captured.text).await?;
        self.ensure_current(generation)?;
        let output = validated_polish_output(&captured.text, &output).context(
            "Original text kept because Polish could not preserve it safely. Try a shorter selection.",
        )?;
        if captured.text == output {
            return Ok(PolishOutcome::Unchanged);
        }
        if captured.mode == SelectionMode::ClipboardOnly {
            self.ports.clipboard.write_text(&output)?;
            return Ok(PolishOutcome::Copied);
        }
        if captured.focused_application.is_none()
            || captured.focused_application != self.ports.focus.focused_application()
        {
            anyhow::bail!("Focused application changed while polishing");
        }
        self.paste_and_restore(&output, generation).await?;
        Ok(PolishOutcome::Replaced)
    }

    async fn capture_selection(&self, generation: u64) -> Result<Option<String>> {
        let original = self.ports.clipboard.snapshot()?;
        let marker = format!("echo-polish-selection-{generation}");
        let started = self
            .ports
            .clipboard
            .write_text(&marker)
            .and_then(|()| self.ports.keyboard.copy());
        if let Err(error) = started {
            self.restore_best_effort(&original);
            return Err(error);
        }
        let selected = self.poll_for_selection(&marker, generation).await;
        self.restore_best_effort(&original);
        selected
    }

    /// The clipboard cannot be read while the copied application holds the
    /// pasteboard mid-write, so a failed read means "not yet" — treating it as
    /// an error would abort a copy that is about to land.
    async fn poll_for_selection(&self, marker: &str, generation: u64) -> Result<Option<String>> {
        for delay in copy_poll_delays() {
            self.ensure_current(generation)?;
            if let Ok(selected) = self.ports.clipboard.read_text() {
                if selected != marker {
                    return Ok(Some(selected));
                }
            }
            tokio::time::sleep(delay).await;
        }
        Ok(None)
    }

    /// Putting the clipboard back is cleanup, not the operation: a pasteboard
    /// that refuses its own former contents must not cost the user the polish
    /// they asked for, nor mask the error that led here.
    fn restore_best_effort(&self, snapshot: &ClipboardSnapshot) {
        if let Err(error) = self.ports.clipboard.restore(snapshot) {
            log::warn!("Could not put the clipboard back after Polish: {error:#}");
        }
    }

    async fn paste_and_restore(&self, output: &str, generation: u64) -> Result<()> {
        self.ensure_current(generation)?;
        let latest = self.ports.clipboard.snapshot()?;
        self.ports.cancellation.commit_if_current(generation, || {
            self.ports.clipboard.write_text(output)?;
            let paste_result = self.ports.keyboard.paste();
            std::thread::sleep(Duration::from_millis(100));
            self.restore_best_effort(&latest);
            paste_result
        })
    }

    fn ensure_current(&self, generation: u64) -> Result<()> {
        if !self.ports.cancellation.is_current(generation) {
            anyhow::bail!("Polish request was cancelled");
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "selection_tests.rs"]
mod tests;
