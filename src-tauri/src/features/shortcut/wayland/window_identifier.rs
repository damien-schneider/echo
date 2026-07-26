use ashpd::WindowIdentifier;
use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;
use log::{debug, warn};
use raw_window_handle::{
    RawDisplayHandle, RawWindowHandle, WaylandDisplayHandle, WaylandWindowHandle,
};
use std::ptr::NonNull;
use tauri::{AppHandle, Manager};
use tokio::sync::oneshot;

struct WaylandAddresses {
    display: usize,
    surface: usize,
}

pub(super) async fn get(app: &AppHandle) -> Option<WindowIdentifier> {
    let addresses = raw_addresses(app)?;
    spawn_identifier_task(addresses).await.ok().flatten()
}

fn raw_addresses(app: &AppHandle) -> Option<WaylandAddresses> {
    let window = app.get_webview_window("main")?;
    let gtk_window = window.gtk_window().ok()?;
    let gdk_window = gtk_window.window()?;
    let display = gdk_window.display();

    unsafe {
        let display_ptr = display.to_glib_none().0;
        let window_ptr = gdk_window.to_glib_none().0;
        let wayland_display = gdk_wayland_display_get_wl_display(display_ptr);
        let wayland_surface = gdk_wayland_window_get_wl_surface(window_ptr);
        if wayland_display.is_null() || wayland_surface.is_null() {
            warn!("[Wayland] Window identifier has a null raw pointer");
            return None;
        }
        Some(WaylandAddresses {
            display: wayland_display as usize,
            surface: wayland_surface as usize,
        })
    }
}

async fn spawn_identifier_task(
    addresses: WaylandAddresses,
) -> Result<Option<WindowIdentifier>, oneshot::error::RecvError> {
    let (sender, receiver) = oneshot::channel();
    std::thread::spawn(move || run_identifier_task(addresses, sender));
    receiver.await
}

fn run_identifier_task(
    addresses: WaylandAddresses,
    sender: oneshot::Sender<Option<WindowIdentifier>>,
) {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build();
    let Ok(runtime) = runtime else {
        let _ = sender.send(None);
        return;
    };
    runtime.block_on(async move {
        let identifier = identifier_from_addresses(addresses).await;
        let _ = sender.send(identifier);
    });
}

async fn identifier_from_addresses(addresses: WaylandAddresses) -> Option<WindowIdentifier> {
    let display = NonNull::new(addresses.display as *mut std::ffi::c_void)?;
    let surface = NonNull::new(addresses.surface as *mut std::ffi::c_void)?;
    let display_handle = RawDisplayHandle::Wayland(WaylandDisplayHandle::new(display));
    let window_handle = RawWindowHandle::Wayland(WaylandWindowHandle::new(surface));
    debug!("[Wayland] Creating portal window identifier from raw handles");
    WindowIdentifier::from_raw_handle(&window_handle, Some(&display_handle)).await
}

extern "C" {
    fn gdk_wayland_display_get_wl_display(
        display: *mut gdk::ffi::GdkDisplay,
    ) -> *mut std::ffi::c_void;
    fn gdk_wayland_window_get_wl_surface(window: *mut gdk::ffi::GdkWindow)
        -> *mut std::ffi::c_void;
}
