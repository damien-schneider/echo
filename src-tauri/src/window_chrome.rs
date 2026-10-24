use tauri::{Runtime, WebviewWindow};

// tauri.conf.json ships decorations:false to dodge GTK CSD artifacts; macOS/Windows re-enable here
pub fn apply_main_window_chrome<R: Runtime>(main_window: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    #[allow(deprecated)] // cocoa deprecated for objc2-app-kit.
    {
        use cocoa::appkit::{NSWindow, NSWindowStyleMask, NSWindowTitleVisibility};
        use cocoa::base::{id, YES};

        // one atomic setStyleMask_ — traffic lights land inside the glass
        if let Ok(ns_win) = main_window.ns_window() {
            unsafe {
                let window = ns_win as id;
                window.setStyleMask_(
                    NSWindowStyleMask::NSTitledWindowMask
                        | NSWindowStyleMask::NSClosableWindowMask
                        | NSWindowStyleMask::NSMiniaturizableWindowMask
                        | NSWindowStyleMask::NSResizableWindowMask
                        | NSWindowStyleMask::NSFullSizeContentViewWindowMask,
                );
                window.setTitlebarAppearsTransparent_(YES);
                window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use tauri::TitleBarStyle;
        let _ = main_window.set_decorations(true);
        let _ = main_window.set_title_bar_style(TitleBarStyle::Transparent);
    }
}

// AppKit lays the traffic lights out again on show; tao moves them to trafficLightPosition only from drawRect
#[cfg(target_os = "macos")]
#[allow(deprecated)] // cocoa deprecated for objc2-app-kit.
pub fn reposition_traffic_lights<R: Runtime>(window: &tauri::Window<R>) {
    use cocoa::appkit::NSWindow;
    use cocoa::base::{id, YES};
    use objc::{msg_send, sel, sel_impl};

    if let Ok(ns_win) = window.ns_window() {
        unsafe {
            let window = ns_win as id;
            let () = msg_send![window.contentView(), setNeedsDisplay: YES];
        }
    }
}
