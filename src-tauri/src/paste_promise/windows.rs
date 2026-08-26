//! Windows serves the promise through delayed rendering: the clipboard holds a null handle for
//! `CF_UNICODETEXT` until a paste asks for it, and the `WM_RENDERFORMAT` that follows is the
//! receipt. Only a window can own a clipboard, so Echo keeps a message-only one alive to answer.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tokio::sync::oneshot;
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardOwner, OpenClipboard, RegisterClipboardFormatW,
    SetClipboardData,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
    SendMessageTimeoutW, TranslateMessage, HWND_MESSAGE, MSG, SMTO_ABORTIFHUNG, WINDOW_EX_STYLE,
    WINDOW_STYLE, WM_APP, WM_DESTROYCLIPBOARD, WM_RENDERALLFORMATS, WM_RENDERFORMAT, WNDCLASSW,
};

use super::{Fetcher, Generation, PromisedTranscript, Receipt};

/// UTF-16 text. An ABI constant, spelled out rather than imported so the clipboard module does not
/// depend on the OLE feature set.
const CF_UNICODETEXT: u32 = 13;
/// How long the promise window gets to answer before the paste goes out without a receipt.
const CLAIM_PATIENCE_MS: u32 = 1_000;
/// Sent to the promise window to claim the clipboard from the thread that owns it.
const WM_ECHO_CLAIM: u32 = WM_APP + 1;
/// Clipboard history and roaming honour this format's presence by skipping the entry — without it
/// Windows fetches every clipboard change and every dictation would look pasted.
const EXCLUDE_FROM_MONITORS: PCWSTR = w!("ExcludeClipboardContentFromMonitorProcessing");
/// The same request to third-party clipboard managers.
const VIEWER_IGNORE: PCWSTR = w!("Clipboard Viewer Ignore");

struct PendingPromise {
    utf16: Vec<u16>,
    consumed_tx: Option<oneshot::Sender<Receipt>>,
}

static PROMISE: Mutex<Option<PendingPromise>> = Mutex::new(None);
/// Emptying the clipboard tells its owner so, and Echo is its own owner: without this the claim
/// would report the transcript it is in the middle of writing as lost.
static SELF_EMPTYING: AtomicBool = AtomicBool::new(false);
/// Ownership is the honest measure of whether the transcript still sits where it was put — the
/// clipboard's own sequence number moves again when the promise is rendered.
static CLAIM: AtomicU64 = AtomicU64::new(0);
/// No claim of ours owns the clipboard.
const FOREIGN_CLIPBOARD: Generation = Generation(0);

/// The promise window lives on its own pumping thread; only its address crosses over.
struct PromiseWindow(usize);

unsafe impl Send for PromiseWindow {}
unsafe impl Sync for PromiseWindow {}

impl PromiseWindow {
    fn handle(&self) -> HWND {
        HWND(std::ptr::with_exposed_provenance_mut(self.0))
    }
}

static WINDOW: OnceLock<Option<PromiseWindow>> = OnceLock::new();

pub(super) fn is_available() -> bool {
    window().is_some()
}

pub(super) fn write_promised_transcript(text: &str) -> Result<PromisedTranscript, String> {
    let window = window().ok_or("No clipboard window to promise from")?;
    let (consumed_tx, consumed) = oneshot::channel();
    let mut utf16: Vec<u16> = text.encode_utf16().collect();
    utf16.push(0);
    *PROMISE
        .lock()
        .map_err(|_| "The clipboard promise lock is poisoned")? = Some(PendingPromise {
        utf16,
        consumed_tx: Some(consumed_tx),
    });

    let mut claimed = 0usize;
    unsafe {
        SendMessageTimeoutW(
            window.handle(),
            WM_ECHO_CLAIM,
            WPARAM(0),
            LPARAM(0),
            SMTO_ABORTIFHUNG,
            CLAIM_PATIENCE_MS,
            Some(&mut claimed),
        )
    };
    if claimed == 0 {
        return Err("Windows refused the clipboard for the transcript".to_string());
    }
    Ok(PromisedTranscript {
        consumed,
        generation: Generation(CLAIM.fetch_add(1, Ordering::SeqCst) + 1),
    })
}

pub(super) fn generation() -> Generation {
    let owned = window().is_some_and(|window| {
        unsafe { GetClipboardOwner() }.is_ok_and(|owner| owner == window.handle())
    });
    if owned {
        Generation(CLAIM.load(Ordering::SeqCst))
    } else {
        FOREIGN_CLIPBOARD
    }
}

fn window() -> Option<&'static PromiseWindow> {
    WINDOW
        .get_or_init(|| {
            let (ready_tx, ready) = mpsc::channel();
            std::thread::Builder::new()
                .name("echo-clipboard-promise".to_string())
                .spawn(move || pump(&ready_tx))
                .ok()?;
            ready.recv().ok().flatten().map(PromiseWindow)
        })
        .as_ref()
}

fn pump(ready: &mpsc::Sender<Option<usize>>) {
    let created = create_window();
    let _ = ready.send(created.map(|window| window.0.expose_provenance()));
    if created.is_none() {
        return;
    }
    let mut message = MSG::default();
    while unsafe { GetMessageW(&mut message, None, 0, 0) }.as_bool() {
        let _ = unsafe { TranslateMessage(&message) };
        unsafe { DispatchMessageW(&message) };
    }
}

fn create_window() -> Option<HWND> {
    let class_name = w!("EchoClipboardPromise");
    let instance = unsafe { GetModuleHandleW(None) }.ok()?;
    let class = WNDCLASSW {
        lpfnWndProc: Some(promise_wndproc),
        hInstance: instance.into(),
        lpszClassName: class_name,
        ..Default::default()
    };
    unsafe { RegisterClassW(&class) };
    unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class_name,
            w!("Echo clipboard promise"),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance.into()),
            None,
        )
    }
    .ok()
}

unsafe extern "system" fn promise_wndproc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_ECHO_CLAIM => LRESULT(isize::from(claim_clipboard(window))),
        WM_RENDERFORMAT if wparam.0 == CF_UNICODETEXT as usize => {
            render_transcript(true);
            LRESULT(0)
        }
        WM_RENDERALLFORMATS => {
            if unsafe { OpenClipboard(Some(window)) }.is_ok() {
                SELF_EMPTYING.store(true, Ordering::SeqCst);
                if unsafe { EmptyClipboard() }.is_ok() {
                    render_transcript(false);
                }
                SELF_EMPTYING.store(false, Ordering::SeqCst);
                let _ = unsafe { CloseClipboard() };
            }
            LRESULT(0)
        }
        WM_DESTROYCLIPBOARD => {
            if !SELF_EMPTYING.load(Ordering::SeqCst) {
                drop_pending_promise();
            }
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(window, message, wparam, lparam) },
    }
}

fn claim_clipboard(window: HWND) -> bool {
    if unsafe { OpenClipboard(Some(window)) }.is_err() {
        return false;
    }
    SELF_EMPTYING.store(true, Ordering::SeqCst);
    let claimed = unsafe { EmptyClipboard() }.is_ok()
        && unsafe { SetClipboardData(CF_UNICODETEXT, None) }.is_ok();
    if claimed {
        mark_as_transient();
    }
    SELF_EMPTYING.store(false, Ordering::SeqCst);
    let _ = unsafe { CloseClipboard() };
    claimed
}

/// A one-byte payload is all these formats carry: clipboard managers look for their presence.
fn mark_as_transient() {
    for name in [EXCLUDE_FROM_MONITORS, VIEWER_IGNORE] {
        let format = unsafe { RegisterClipboardFormatW(name) };
        if format == 0 {
            continue;
        }
        let Some(handle) = global_copy(&[0u16]) else {
            continue;
        };
        if unsafe { SetClipboardData(format, Some(HANDLE(handle.0))) }.is_err() {
            unsafe { GlobalFree(Some(handle)) }.ok();
        }
    }
}

/// Hands the text to whoever asked. `receipted` separates a real paste from the render Windows
/// requests when the owning window is going away.
fn render_transcript(receipted: bool) {
    let Ok(mut promise) = PROMISE.lock() else {
        return;
    };
    let Some(pending) = promise.as_mut() else {
        return;
    };
    if let Some(handle) = global_copy(&pending.utf16) {
        if unsafe { SetClipboardData(CF_UNICODETEXT, Some(HANDLE(handle.0))) }.is_err() {
            unsafe { GlobalFree(Some(handle)) }.ok();
            return;
        }
    }
    if !receipted {
        return;
    }
    if let Some(tx) = pending.consumed_tx.take() {
        let _ = tx.send(Receipt {
            at: Instant::now(),
            by: Fetcher::Unknown,
        });
    }
}

fn drop_pending_promise() {
    if let Ok(mut promise) = PROMISE.lock() {
        *promise = None;
    }
}

/// Clipboard data must live in moveable global memory the system takes ownership of.
fn global_copy(utf16: &[u16]) -> Option<HGLOBAL> {
    let bytes = std::mem::size_of_val(utf16);
    let handle = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes) }.ok()?;
    let target = unsafe { GlobalLock(handle) };
    if target.is_null() {
        unsafe { GlobalFree(Some(handle)) }.ok();
        return None;
    }
    unsafe { std::ptr::copy_nonoverlapping(utf16.as_ptr(), target.cast::<u16>(), utf16.len()) };
    let _ = unsafe { GlobalUnlock(handle) };
    Some(handle)
}
