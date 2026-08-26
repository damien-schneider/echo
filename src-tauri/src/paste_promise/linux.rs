//! X11 hands out a selection lazily by design: whoever owns CLIPBOARD serves every paste itself.
//! The request carries the window that asked, so this is the one platform where a receipt says not
//! just that the transcript was taken but by whom — a paste into the focused app, or a clipboard
//! manager helping itself.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tokio::sync::oneshot;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ConnectionExt, CreateWindowAux, EventMask, PropMode, SelectionNotifyEvent,
    SelectionRequestEvent, Window, WindowClass,
};
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;
use x11rb::COPY_FROM_PARENT;

use super::{Fetcher, Generation, PromisedTranscript, Receipt};

/// A selection is served in a single reply here; anything longer would need the INCR protocol, and
/// a dictation that size belongs on the clipboard the plain way.
const LONGEST_SERVABLE_TRANSCRIPT: usize = 100_000;
/// Owning the selection is Echo's only claim to the clipboard; counting the claims lets a later
/// look tell whether the transcript still sits where it was put. The claim itself goes out with
/// `CURRENT_TIME`: a timestamp taken once at startup goes stale the moment anything else is copied,
/// and the server then ignores the claim outright.
static CLAIM: AtomicU64 = AtomicU64::new(0);
/// No claim of ours owns the clipboard.
const FOREIGN_CLIPBOARD: Generation = Generation(0);

struct Pending {
    text: String,
    consumed_tx: Option<oneshot::Sender<Receipt>>,
}

static PROMISE: Mutex<Option<Pending>> = Mutex::new(None);

struct Selection {
    connection: Arc<RustConnection>,
    window: Window,
    atoms: Atoms,
}

#[derive(Clone, Copy)]
struct Atoms {
    clipboard: Atom,
    targets: Atom,
    timestamp: Atom,
    utf8_string: Atom,
    text_plain: Atom,
    text_plain_utf8: Atom,
}

impl Atoms {
    fn text_targets(&self) -> [Atom; 4] {
        [
            self.utf8_string,
            self.text_plain_utf8,
            self.text_plain,
            AtomEnum::STRING.into(),
        ]
    }

    fn advertised(&self) -> [Atom; 6] {
        let [utf8, plain_utf8, plain, string] = self.text_targets();
        [
            self.targets,
            self.timestamp,
            utf8,
            plain_utf8,
            plain,
            string,
        ]
    }
}

static SELECTION: OnceLock<Option<Selection>> = OnceLock::new();

pub(super) fn is_available() -> bool {
    !crate::wayland::is_wayland() && selection().is_some()
}

pub(super) fn write_promised_transcript(text: &str) -> Result<PromisedTranscript, String> {
    if text.len() > LONGEST_SERVABLE_TRANSCRIPT {
        return Err("Transcript too long to serve as a selection".to_string());
    }
    let selection = selection().ok_or("No X11 selection to promise from")?;
    let (consumed_tx, consumed) = oneshot::channel();
    *PROMISE
        .lock()
        .map_err(|_| "The selection promise lock is poisoned")? = Some(Pending {
        text: text.to_string(),
        consumed_tx: Some(consumed_tx),
    });

    selection
        .connection
        .set_selection_owner(
            selection.window,
            selection.atoms.clipboard,
            x11rb::CURRENT_TIME,
        )
        .map_err(|error| format!("Failed to claim the X11 clipboard: {error}"))?
        .check()
        .map_err(|error| format!("The X11 clipboard refused the claim: {error}"))?;
    let generation = Generation(CLAIM.fetch_add(1, Ordering::SeqCst) + 1);
    if !owns_clipboard(selection) {
        return Err("Another client kept the X11 clipboard".to_string());
    }
    Ok(PromisedTranscript {
        consumed,
        generation,
    })
}

pub(super) fn generation() -> Generation {
    match selection() {
        Some(selection) if owns_clipboard(selection) => Generation(CLAIM.load(Ordering::SeqCst)),
        _ => FOREIGN_CLIPBOARD,
    }
}

fn owns_clipboard(selection: &Selection) -> bool {
    selection
        .connection
        .get_selection_owner(selection.atoms.clipboard)
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .is_some_and(|reply| reply.owner == selection.window)
}

fn selection() -> Option<&'static Selection> {
    SELECTION
        .get_or_init(|| {
            let selection = open_selection()
                .inspect_err(|error| log::warn!("X11 clipboard promises unavailable: {error}"))
                .ok()?;
            let served = Arc::clone(&selection.connection);
            let window = selection.window;
            let atoms = selection.atoms;
            std::thread::Builder::new()
                .name("echo-clipboard-promise".to_string())
                .spawn(move || serve(&served, window, &atoms))
                .ok()?;
            Some(selection)
        })
        .as_ref()
}

fn open_selection() -> Result<Selection, String> {
    let (connection, screen_index) =
        x11rb::connect(None).map_err(|error| format!("no X display: {error}"))?;
    let root = connection
        .setup()
        .roots
        .get(screen_index)
        .ok_or("the X display has no screen")?
        .root;
    let window = connection
        .generate_id()
        .map_err(|error| format!("no window id: {error}"))?;
    connection
        .create_window(
            0,
            window,
            root,
            0,
            0,
            1,
            1,
            0,
            WindowClass::INPUT_ONLY,
            COPY_FROM_PARENT,
            &CreateWindowAux::new(),
        )
        .map_err(|error| format!("no promise window: {error}"))?;
    Ok(Selection {
        atoms: intern_atoms(&connection)?,
        connection: Arc::new(connection),
        window,
    })
}

fn intern_atoms(connection: &RustConnection) -> Result<Atoms, String> {
    let intern = |name: &str| -> Result<Atom, String> {
        connection
            .intern_atom(false, name.as_bytes())
            .map_err(|error| format!("intern {name}: {error}"))?
            .reply()
            .map(|reply| reply.atom)
            .map_err(|error| format!("intern {name}: {error}"))
    };
    Ok(Atoms {
        clipboard: intern("CLIPBOARD")?,
        targets: intern("TARGETS")?,
        timestamp: intern("TIMESTAMP")?,
        utf8_string: intern("UTF8_STRING")?,
        text_plain: intern("text/plain")?,
        text_plain_utf8: intern("text/plain;charset=utf-8")?,
    })
}

fn serve(connection: &RustConnection, window: Window, atoms: &Atoms) {
    while let Ok(event) = connection.wait_for_event() {
        match event {
            Event::SelectionRequest(request) if request.owner == window => {
                answer(connection, window, atoms, &request);
            }
            Event::SelectionClear(clear) if clear.selection == atoms.clipboard => {
                if let Ok(mut promise) = PROMISE.lock() {
                    *promise = None;
                }
            }
            _ => {}
        }
    }
}

fn answer(
    connection: &RustConnection,
    window: Window,
    atoms: &Atoms,
    request: &SelectionRequestEvent,
) {
    let served = if request.target == atoms.targets {
        connection
            .change_property32(
                PropMode::REPLACE,
                request.requestor,
                request.property,
                AtomEnum::ATOM,
                &atoms.advertised(),
            )
            .is_ok()
    } else if request.target == atoms.timestamp {
        connection
            .change_property32(
                PropMode::REPLACE,
                request.requestor,
                request.property,
                AtomEnum::INTEGER,
                &[request.time],
            )
            .is_ok()
    } else if atoms.text_targets().contains(&request.target) {
        serve_transcript(connection, window, request)
    } else {
        false
    };
    let notify = SelectionNotifyEvent {
        response_type: x11rb::protocol::xproto::SELECTION_NOTIFY_EVENT,
        sequence: 0,
        time: request.time,
        requestor: request.requestor,
        selection: request.selection,
        target: request.target,
        property: if served {
            request.property
        } else {
            AtomEnum::NONE.into()
        },
    };
    let _ = connection.send_event(false, request.requestor, EventMask::NO_EVENT, notify);
    let _ = connection.flush();
}

/// The one branch that is a paste: text left the promise, so the receipt fires — named with the
/// client that asked, which the X server hands over for free.
fn serve_transcript(
    connection: &RustConnection,
    window: Window,
    request: &SelectionRequestEvent,
) -> bool {
    let Ok(mut promise) = PROMISE.lock() else {
        return false;
    };
    let Some(pending) = promise.as_mut() else {
        return false;
    };
    let written = connection
        .change_property8(
            PropMode::REPLACE,
            request.requestor,
            request.property,
            request.target,
            pending.text.as_bytes(),
        )
        .is_ok();
    if !written {
        return false;
    }
    if let Some(tx) = pending.consumed_tx.take() {
        let _ = tx.send(Receipt {
            at: Instant::now(),
            by: fetcher_of(connection, window, request.requestor),
        });
    }
    true
}

fn fetcher_of(connection: &RustConnection, window: Window, requestor: Window) -> Fetcher {
    let client_mask = connection.setup().resource_id_mask;
    let Some(focused) = connection
        .get_input_focus()
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .map(|reply| reply.focus)
    else {
        return Fetcher::Unknown;
    };
    if focused <= 1 || same_client(focused, window, client_mask) {
        return Fetcher::Unknown;
    }
    if same_client(requestor, focused, client_mask) {
        Fetcher::Focused
    } else {
        Fetcher::Foreign
    }
}

/// X namespaces resource ids per client, so two windows sharing the high bits belong to one
/// application.
fn same_client(one: Window, other: Window, client_mask: u32) -> bool {
    (one & !client_mask) == (other & !client_mask)
}

#[cfg(test)]
mod tests {
    use super::same_client;

    /// Telling a paste from a clipboard manager on X11 rests entirely on this id layout.
    #[test]
    fn windows_of_one_client_share_their_id_base() {
        let mask = 0x001f_ffff;
        assert!(same_client(0x0200_0001, 0x0200_0042, mask));
        assert!(!same_client(0x0200_0001, 0x0400_0001, mask));
    }
}
