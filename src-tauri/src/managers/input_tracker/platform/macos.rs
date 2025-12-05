//! macOS-specific application detection using native Cocoa and Accessibility APIs.

use super::ActiveAppInfo;

/// Get information about the currently active (frontmost) application
/// Uses native Cocoa NSWorkspace APIs and Accessibility APIs for reliable detection
/// including overlay/panel apps like Raycast and Spotlight
#[allow(deprecated)] // cocoa crate deprecation warnings - objc2 migration not needed for this simple usage
pub fn get_active_app_info() -> ActiveAppInfo {
    use cocoa::base::{id, nil};
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        // First try: Get the focused application using Accessibility API
        // This is more reliable for overlay/panel apps like Raycast
        let system_wide: id = msg_send![class!(NSWorkspace), sharedWorkspace];

        // Try to get the running application that has keyboard focus via accessibility
        // AXUIElementCopyAttributeValue with kAXFocusedApplicationAttribute
        let focused_app = get_focused_app_via_accessibility();
        if let Some(app_info) = focused_app {
            return app_info;
        }

        // Fallback: Get the frontmost application from NSWorkspace
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
        // Get the localized name (displayed name, not process name)
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

        // Get the bundle identifier
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

        // Get the process identifier (pid)
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

/// Get the focused application using macOS Accessibility API
/// This catches overlay apps like Raycast that don't become "frontmost" in the traditional sense
fn get_focused_app_via_accessibility() -> Option<ActiveAppInfo> {
    use std::ffi::c_void;
    use std::ptr;

    // Core Foundation and Accessibility types
    type CFTypeRef = *const c_void;
    type AXUIElementRef = CFTypeRef;
    type CFStringRef = *const c_void;

    #[allow(non_upper_case_globals)]
    const kAXErrorSuccess: i32 = 0;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> i32;
        fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut i32) -> i32;
        fn CFRelease(cf: CFTypeRef);
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            alloc: CFTypeRef,
            c_str: *const i8,
            encoding: u32,
        ) -> CFStringRef;
    }

    #[allow(non_upper_case_globals)]
    const kCFStringEncodingUTF8: u32 = 0x08000100;

    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() {
            return None;
        }

        // Try to get the focused UI element first (this works for text fields in any app)
        let focused_elem_attr = b"AXFocusedUIElement\0".as_ptr() as *const i8;
        let focused_elem_attr_cf =
            CFStringCreateWithCString(ptr::null(), focused_elem_attr, kCFStringEncodingUTF8);

        if focused_elem_attr_cf.is_null() {
            CFRelease(system_wide);
            return None;
        }

        let mut focused_elem: CFTypeRef = ptr::null();
        let result =
            AXUIElementCopyAttributeValue(system_wide, focused_elem_attr_cf, &mut focused_elem);

        CFRelease(focused_elem_attr_cf);
        CFRelease(system_wide);

        if result != kAXErrorSuccess || focused_elem.is_null() {
            return None;
        }

        // Get the PID from the focused element using AXUIElementGetPid
        let mut pid: i32 = 0;
        let pid_result = AXUIElementGetPid(focused_elem, &mut pid);

        CFRelease(focused_elem);

        if pid_result != kAXErrorSuccess || pid == 0 {
            return None;
        }

        // Now get the NSRunningApplication for this PID
        use cocoa::base::{id, nil};
        use objc::{class, msg_send, sel, sel_impl};

        #[allow(deprecated)]
        let running_app: id = msg_send![
            class!(NSRunningApplication),
            runningApplicationWithProcessIdentifier: pid
        ];

        #[allow(deprecated)]
        if running_app != nil {
            return Some(extract_app_info(running_app));
        }

        None
    }
}
