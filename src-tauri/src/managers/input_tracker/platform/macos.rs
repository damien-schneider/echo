use super::ActiveAppInfo;

#[allow(deprecated)]
pub fn get_active_app_info() -> ActiveAppInfo {
    use cocoa::base::{id, nil};
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let system_wide: id = msg_send![class!(NSWorkspace), sharedWorkspace];

        let focused_app = get_focused_app_via_accessibility();
        if let Some(app_info) = focused_app {
            return app_info;
        }

        if system_wide == nil {
            log::debug!("[InputTracker] Failed to get NSWorkspace");
            return ActiveAppInfo::default();
        }

        let front_app: id = msg_send![system_wide, frontmostApplication];
        if front_app == nil {
            log::debug!("[InputTracker] No frontmost application");
            return ActiveAppInfo::default();
        }

        extract_app_info(front_app)
    }
}

#[allow(deprecated)]
fn extract_app_info(app: cocoa::base::id) -> ActiveAppInfo {
    use cocoa::base::{id, nil};
    use objc::{msg_send, sel, sel_impl};

    unsafe {
        let localized_name: id = msg_send![app, localizedName];
        let name = if localized_name != nil {
            let c_str: *const i8 = msg_send![localized_name, UTF8String];
            if !c_str.is_null() {
                std::ffi::CStr::from_ptr(c_str)
                    .to_string_lossy()
                    .into_owned()
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let bundle_id_ns: id = msg_send![app, bundleIdentifier];
        let bundle_id = if bundle_id_ns != nil {
            let c_str: *const i8 = msg_send![bundle_id_ns, UTF8String];
            if !c_str.is_null() {
                Some(
                    std::ffi::CStr::from_ptr(c_str)
                        .to_string_lossy()
                        .into_owned(),
                )
            } else {
                None
            }
        } else {
            None
        };

        let pid: i32 = msg_send![app, processIdentifier];

        if name.is_empty() {
            ActiveAppInfo::default()
        } else {
            ActiveAppInfo {
                name,
                bundle_id,
                pid: Some(pid),
            }
        }
    }
}

/// Catches overlay apps like Raycast that never become frontmost.
#[allow(deprecated)]
fn get_focused_app_via_accessibility() -> Option<ActiveAppInfo> {
    use cocoa::base::{id, nil};
    use objc::{class, msg_send, sel, sel_impl};

    let pid = crate::macos_accessibility::focused_application_pid()?;
    unsafe {
        let running_app: id = msg_send![
            class!(NSRunningApplication),
            runningApplicationWithProcessIdentifier: pid
        ];
        (running_app != nil).then(|| extract_app_info(running_app))
    }
}
