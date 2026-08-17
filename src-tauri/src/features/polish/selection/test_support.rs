use super::super::*;
use anyhow::Result;
use async_trait::async_trait;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Default)]
pub(super) struct ClipboardFaults {
    /// Leading `read_text` failures, standing in for a pasteboard caught mid-write.
    pub(super) unreadable_reads: usize,
    pub(super) restore_fails: bool,
}

#[derive(Clone)]
pub(super) struct FakeClipboard {
    current: Arc<Mutex<ClipboardSnapshot>>,
    faults: ClipboardFaults,
    reads: Arc<AtomicUsize>,
}

impl FakeClipboard {
    fn with_text(text: &str, faults: ClipboardFaults) -> Self {
        Self {
            current: Arc::new(Mutex::new(snapshot(text))),
            faults,
            reads: Arc::new(AtomicUsize::new(0)),
        }
    }

    pub(super) fn current(&self) -> ClipboardSnapshot {
        self.current.lock().unwrap().clone()
    }
}

impl ClipboardPort for FakeClipboard {
    fn snapshot(&self) -> Result<ClipboardSnapshot> {
        Ok(self.current())
    }

    fn read_text(&self) -> Result<String> {
        if self.reads.fetch_add(1, Ordering::SeqCst) < self.faults.unreadable_reads {
            anyhow::bail!("clipboard holds no text");
        }
        let current = self.current.lock().unwrap();
        let text = current.formats.iter().find(|format| format.name == "text");
        Ok(text
            .map(|format| String::from_utf8_lossy(&format.data).to_string())
            .unwrap_or_default())
    }

    fn write_text(&self, text: &str) -> Result<()> {
        *self.current.lock().unwrap() = snapshot(text);
        Ok(())
    }

    fn restore(&self, snapshot: &ClipboardSnapshot) -> Result<()> {
        if self.faults.restore_fails {
            anyhow::bail!("clipboard restore was rejected");
        }
        *self.current.lock().unwrap() = snapshot.clone();
        Ok(())
    }
}

struct FakeKeyboard {
    clipboard: FakeClipboard,
    selection: String,
    paste_count: Arc<AtomicU64>,
    pasted_text: Arc<Mutex<Option<String>>>,
    copies_selection: bool,
    copy_delay: Duration,
}

impl KeyboardPort for FakeKeyboard {
    fn copy(&self) -> Result<()> {
        if !self.copies_selection {
            return Ok(());
        }
        if self.copy_delay.is_zero() {
            return self.clipboard.write_text(&self.selection);
        }
        let clipboard = self.clipboard.clone();
        let selection = self.selection.clone();
        let delay = self.copy_delay;
        tokio::spawn(async move {
            tokio::time::sleep(delay).await;
            let _ = clipboard.write_text(&selection);
        });
        Ok(())
    }

    fn paste(&self) -> Result<()> {
        self.paste_count.fetch_add(1, Ordering::SeqCst);
        *self.pasted_text.lock().unwrap() = Some(self.clipboard.read_text()?);
        Ok(())
    }
}

struct FakeFocus {
    application: Arc<Mutex<Option<String>>>,
}

impl FocusPort for FakeFocus {
    fn focused_application(&self) -> Option<String> {
        self.application.lock().unwrap().clone()
    }
}

struct FakeInference {
    output: String,
    token_count: usize,
    during_inference: Option<Box<dyn Fn() + Send + Sync>>,
    token_count_calls: Arc<AtomicU64>,
    polish_calls: Arc<AtomicU64>,
}

#[async_trait]
impl InferencePort for FakeInference {
    async fn token_count(&self, _text: &str) -> Result<usize> {
        self.token_count_calls.fetch_add(1, Ordering::SeqCst);
        Ok(self.token_count)
    }

    async fn polish(&self, _text: &str) -> Result<String> {
        self.polish_calls.fetch_add(1, Ordering::SeqCst);
        if let Some(action) = &self.during_inference {
            action();
        }
        Ok(self.output.clone())
    }
}

pub(super) struct Fixture {
    pub(super) transaction: PolishTransaction,
    pub(super) clipboard: FakeClipboard,
    pub(super) paste_count: Arc<AtomicU64>,
    pub(super) pasted_text: Arc<Mutex<Option<String>>>,
    pub(super) cancellation: Arc<CancellationClock>,
    pub(super) token_count_calls: Arc<AtomicU64>,
    pub(super) polish_calls: Arc<AtomicU64>,
}

pub(super) fn fixture(selection: &str, output: &str) -> Fixture {
    fixture_with_options(FixtureOptions {
        selection,
        output,
        ..FixtureOptions::default()
    })
}

pub(super) struct FixtureOptions<'a> {
    pub(super) selection: &'a str,
    pub(super) output: &'a str,
    pub(super) copies_selection: bool,
    pub(super) token_count: usize,
    pub(super) clipboard_change: Option<&'a str>,
    pub(super) focus_change: Option<&'a str>,
    pub(super) copy_delay: Duration,
    pub(super) faults: ClipboardFaults,
}

impl Default for FixtureOptions<'_> {
    fn default() -> Self {
        Self {
            selection: "This are wrong.",
            output: "This is wrong.",
            copies_selection: true,
            token_count: 20,
            clipboard_change: None,
            focus_change: None,
            copy_delay: Duration::ZERO,
            faults: ClipboardFaults::default(),
        }
    }
}

pub(super) fn fixture_with_options(options: FixtureOptions<'_>) -> Fixture {
    let clipboard = FakeClipboard::with_text("original clipboard", options.faults.clone());
    clipboard
        .current
        .lock()
        .unwrap()
        .formats
        .push(ClipboardFormat {
            name: "image/png".to_string(),
            data: vec![1, 2, 3],
        });
    let focus = Arc::new(Mutex::new(Some("com.example.Editor".to_string())));
    let paste_count = Arc::new(AtomicU64::new(0));
    let pasted_text = Arc::new(Mutex::new(None));
    let token_count_calls = Arc::new(AtomicU64::new(0));
    let polish_calls = Arc::new(AtomicU64::new(0));
    let cancellation = Arc::new(CancellationClock::default());
    let clipboard_for_inference = clipboard.clone();
    let clipboard_change = options.clipboard_change.map(str::to_string);
    let focus_for_inference = focus.clone();
    let focus_change = options.focus_change.map(str::to_string);
    let during_inference = if clipboard_change.is_some() || focus_change.is_some() {
        Some(Box::new(move || {
            if let Some(text) = &clipboard_change {
                clipboard_for_inference.write_text(text).unwrap();
            }
            if let Some(application) = &focus_change {
                *focus_for_inference.lock().unwrap() = Some(application.clone());
            }
        }) as Box<dyn Fn() + Send + Sync>)
    } else {
        None
    };
    let ports = PolishTransactionPorts {
        clipboard: Arc::new(clipboard.clone()),
        clipboard_access: Arc::new(tokio::sync::Mutex::new(())),
        keyboard: Arc::new(FakeKeyboard {
            clipboard: clipboard.clone(),
            selection: options.selection.to_string(),
            paste_count: paste_count.clone(),
            pasted_text: pasted_text.clone(),
            copies_selection: options.copies_selection,
            copy_delay: options.copy_delay,
        }),
        focus: Arc::new(FakeFocus {
            application: focus.clone(),
        }),
        inference: Arc::new(FakeInference {
            output: options.output.to_string(),
            token_count: options.token_count,
            during_inference,
            token_count_calls: token_count_calls.clone(),
            polish_calls: polish_calls.clone(),
        }),
        cancellation: cancellation.clone(),
    };
    Fixture {
        transaction: PolishTransaction::new(ports),
        clipboard,
        paste_count,
        pasted_text,
        cancellation,
        token_count_calls,
        polish_calls,
    }
}

fn snapshot(text: &str) -> ClipboardSnapshot {
    ClipboardSnapshot {
        formats: vec![ClipboardFormat {
            name: "text".to_string(),
            data: text.as_bytes().to_vec(),
        }],
    }
}

fn capture_transaction(
    clipboard: &FakeClipboard,
    clipboard_access: Arc<tokio::sync::Mutex<()>>,
    selection: &str,
    copy_delay: Duration,
) -> (PolishTransaction, Arc<CancellationClock>) {
    let cancellation = Arc::new(CancellationClock::default());
    let transaction = PolishTransaction::new(PolishTransactionPorts {
        clipboard: Arc::new(clipboard.clone()),
        clipboard_access,
        keyboard: Arc::new(FakeKeyboard {
            clipboard: clipboard.clone(),
            selection: selection.to_string(),
            paste_count: Arc::new(AtomicU64::new(0)),
            pasted_text: Arc::new(Mutex::new(None)),
            copies_selection: true,
            copy_delay,
        }),
        focus: Arc::new(FakeFocus {
            application: Arc::new(Mutex::new(Some("com.example.Editor".to_string()))),
        }),
        inference: Arc::new(FakeInference {
            output: String::new(),
            token_count: 0,
            during_inference: None,
            token_count_calls: Arc::new(AtomicU64::new(0)),
            polish_calls: Arc::new(AtomicU64::new(0)),
        }),
        cancellation: cancellation.clone(),
    });
    (transaction, cancellation)
}

#[tokio::test(start_paused = true)]
async fn concurrent_selection_captures_share_one_clipboard_lease() {
    let clipboard = FakeClipboard::with_text("original clipboard", ClipboardFaults::default());
    let clipboard_access = Arc::new(tokio::sync::Mutex::new(()));
    let (first, first_cancellation) = capture_transaction(
        &clipboard,
        clipboard_access.clone(),
        "first selection",
        Duration::from_millis(200),
    );
    let (second, second_cancellation) = capture_transaction(
        &clipboard,
        clipboard_access,
        "second selection",
        Duration::ZERO,
    );
    let first_generation = first_cancellation.begin();
    second_cancellation.begin();
    let second_generation = second_cancellation.begin();

    let first_capture = tokio::spawn(async move {
        first
            .capture_text(SelectionMode::ReplaceSelection, first_generation)
            .await
            .unwrap()
    });
    tokio::task::yield_now().await;
    assert_eq!(
        clipboard.read_text().unwrap(),
        format!("echo-selection-{first_generation}")
    );

    let second_capture = tokio::spawn(async move {
        second
            .capture_text(SelectionMode::ReplaceSelection, second_generation)
            .await
            .unwrap()
    });
    tokio::task::yield_now().await;
    assert_eq!(
        clipboard.read_text().unwrap(),
        format!("echo-selection-{first_generation}")
    );

    tokio::time::advance(Duration::from_millis(250)).await;
    assert_eq!(
        first_capture.await.unwrap(),
        Some("first selection".to_string())
    );
    assert_eq!(
        second_capture.await.unwrap(),
        Some("second selection".to_string())
    );
    assert_eq!(clipboard.read_text().unwrap(), "original clipboard");
}
