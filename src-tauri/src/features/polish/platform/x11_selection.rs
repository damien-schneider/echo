use std::time::{Duration, Instant};

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ConnectionExt, CreateWindowAux, SelectionNotifyEvent, Window, WindowClass,
};
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;
use x11rb::{COPY_FROM_PARENT, CURRENT_TIME, NONE};

use super::DirectSelection;
use crate::paste_promise::same_client;

/// An owner silent past this reads as unavailable rather than stalling the shortcut.
const OWNER_REPLY_TIMEOUT: Duration = Duration::from_millis(150);
const EVENT_POLL_STEP: Duration = Duration::from_millis(5);
/// In 32-bit units; owners hand larger selections over INCR, which is not followed.
const LONGEST_SELECTION_WORDS: u32 = 1 << 22;

pub(super) struct FocusedSelection {
    pub(super) selection: DirectSelection,
    pub(super) focused_pid: Option<u32>,
}

struct Atoms {
    net_active_window: Atom,
    net_wm_pid: Atom,
    utf8_string: Atom,
    incr: Atom,
    transfer: Atom,
}

/// PRIMARY holds whatever was last highlighted anywhere, so it only speaks for the focused window when that window's client owns it.
pub(super) fn focused_selection() -> FocusedSelection {
    let unavailable = FocusedSelection {
        selection: DirectSelection::Unavailable,
        focused_pid: None,
    };
    let Ok((connection, screen_index)) = x11rb::connect(None) else {
        return unavailable;
    };
    let Some(root) = connection
        .setup()
        .roots
        .get(screen_index)
        .map(|screen| screen.root)
    else {
        return unavailable;
    };
    let Some(atoms) = intern_atoms(&connection) else {
        return unavailable;
    };
    let Some(active) =
        window_property(&connection, root, atoms.net_active_window, AtomEnum::WINDOW)
            .filter(|&window| window != NONE)
    else {
        return unavailable;
    };
    let focused_pid = window_property(&connection, active, atoms.net_wm_pid, AtomEnum::CARDINAL);
    let selection = if focused_pid == Some(std::process::id()) {
        DirectSelection::Unavailable
    } else {
        primary_of_focused_client(&connection, root, active, &atoms)
    };
    FocusedSelection {
        selection,
        focused_pid,
    }
}

fn intern_atoms(connection: &RustConnection) -> Option<Atoms> {
    let intern = |name: &str| -> Option<Atom> {
        Some(
            connection
                .intern_atom(false, name.as_bytes())
                .ok()?
                .reply()
                .ok()?
                .atom,
        )
    };
    Some(Atoms {
        net_active_window: intern("_NET_ACTIVE_WINDOW")?,
        net_wm_pid: intern("_NET_WM_PID")?,
        utf8_string: intern("UTF8_STRING")?,
        incr: intern("INCR")?,
        transfer: intern("ECHO_SELECTION")?,
    })
}

fn window_property(
    connection: &RustConnection,
    window: Window,
    property: Atom,
    kind: AtomEnum,
) -> Option<u32> {
    connection
        .get_property(false, window, property, kind, 0, 1)
        .ok()?
        .reply()
        .ok()?
        .value32()?
        .next()
}

fn primary_of_focused_client(
    connection: &RustConnection,
    root: Window,
    active: Window,
    atoms: &Atoms,
) -> DirectSelection {
    let Some(owner) = connection
        .get_selection_owner(AtomEnum::PRIMARY.into())
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .map(|reply| reply.owner)
    else {
        return DirectSelection::Unavailable;
    };
    if owner == NONE || !same_client(owner, active, connection.setup().resource_id_mask) {
        return DirectSelection::Empty;
    }
    fetched_primary(connection, root, atoms).unwrap_or(DirectSelection::Unavailable)
}

fn fetched_primary(
    connection: &RustConnection,
    root: Window,
    atoms: &Atoms,
) -> Option<DirectSelection> {
    let window = connection.generate_id().ok()?;
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
        .ok()?;
    let deadline = Instant::now() + OWNER_REPLY_TIMEOUT;
    let fetched = [atoms.utf8_string, AtomEnum::STRING.into()]
        .into_iter()
        .find_map(|target| converted(connection, window, atoms, target, deadline));
    let _ = connection.destroy_window(window);
    let _ = connection.flush();
    fetched
}

fn converted(
    connection: &RustConnection,
    window: Window,
    atoms: &Atoms,
    target: Atom,
    deadline: Instant,
) -> Option<DirectSelection> {
    connection
        .convert_selection(
            window,
            AtomEnum::PRIMARY.into(),
            target,
            atoms.transfer,
            CURRENT_TIME,
        )
        .ok()?;
    connection.flush().ok()?;
    let notify = selection_notify(connection, window, target, deadline)?;
    if notify.property == NONE {
        return None;
    }
    let reply = connection
        .get_property(
            true,
            window,
            notify.property,
            AtomEnum::ANY,
            0,
            LONGEST_SELECTION_WORDS,
        )
        .ok()?
        .reply()
        .ok()?;
    if reply.type_ == atoms.incr || reply.format != 8 || reply.bytes_after > 0 {
        return None;
    }
    let text = if target == atoms.utf8_string {
        String::from_utf8(reply.value).ok()?
    } else {
        reply.value.into_iter().map(char::from).collect()
    };
    Some(if text.is_empty() {
        DirectSelection::Empty
    } else {
        DirectSelection::Text(text)
    })
}

fn selection_notify(
    connection: &RustConnection,
    window: Window,
    target: Atom,
    deadline: Instant,
) -> Option<SelectionNotifyEvent> {
    loop {
        match connection.poll_for_event().ok()? {
            Some(Event::SelectionNotify(event))
                if event.requestor == window && event.target == target =>
            {
                return Some(event)
            }
            Some(_) => {}
            None if Instant::now() >= deadline => return None,
            None => std::thread::sleep(EVENT_POLL_STEP),
        }
    }
}
