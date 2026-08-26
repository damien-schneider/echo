use crate::caret::CaretSight;
use anyhow::Result;
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use std::ffi::c_void;
use std::ptr;

const AX_ERROR_ATTRIBUTE_UNSUPPORTED: i32 = -25_205;
const AX_ERROR_API_DISABLED: i32 = -25_211;
const AX_ERROR_NO_VALUE: i32 = -25_212;
const AX_ERROR_SUCCESS: i32 = 0;
const AX_FOCUSED_UI_ELEMENT_ATTRIBUTE: &str = "AXFocusedUIElement";
const AX_ROLE_ATTRIBUTE: &str = "AXRole";
const AX_SELECTED_TEXT_ATTRIBUTE: &str = "AXSelectedText";

const TEXT_INPUT_ROLES: &[&str] = &["AXTextArea", "AXTextField", "AXComboBox", "AXSearchField"];
/// Roles that demonstrably hold the focus yet cannot take a text paste. AXWebArea sits here on
/// purpose: Chromium's web area answers AXSelectedTextRange even on a page with nothing editable,
/// while a real web input gets its own AXTextField/AXTextArea element.
const PASTE_DEAF_ROLES: &[&str] = &[
    "AXWebArea",
    "AXScrollArea",
    "AXButton",
    "AXImage",
    "AXStaticText",
    "AXTable",
    "AXOutline",
    "AXList",
    "AXMenu",
    "AXMenuItem",
    "AXToolbar",
    "AXRadioButton",
    "AXCheckBox",
    "AXLink",
    "AXTabGroup",
];
/// Electron builds its accessibility tree only when asked to — this attribute is the ask.
const AX_MANUAL_ACCESSIBILITY_ATTRIBUTE: &str = "AXManualAccessibility";

type AXUIElementRef = *const c_void;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SelectedText {
    /// The focused element's own answer — says nothing about a selection elsewhere in the window.
    Empty,
    PermissionRequired,
    Text(String),
    /// Nothing to ask: no focused element, no text support, or Echo itself holds the focus.
    Unavailable,
}

enum AttributeRead {
    Missing,
    Unsupported,
    Value(CFType),
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {

    fn AXIsProcessTrusted() -> u8;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> i32;
    fn AXUIElementCreateApplication(pid: libc::pid_t) -> AXUIElementRef;
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut libc::pid_t) -> i32;
    fn AXUIElementSetAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: CFTypeRef,
    ) -> i32;
}

pub(crate) fn is_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

pub(crate) fn selected_text() -> Result<SelectedText> {
    if !is_trusted() {
        return Ok(SelectedText::PermissionRequired);
    }
    let AttributeRead::Value(focused) = focused_element()? else {
        return Ok(SelectedText::Unavailable);
    };
    if element_belongs_to_echo(&focused) {
        return Ok(SelectedText::Unavailable);
    }
    selected_text_from_element(&focused)
}

fn element_belongs_to_echo(element: &CFType) -> bool {
    let echo_pid = i32::try_from(std::process::id()).ok();
    element_pid(element).is_some_and(|pid| Some(pid) == echo_pid)
}

/// Electron apps grow an accessibility tree only once asked — asked here, at dictation start, so
/// the tree exists by the time the delivery probe looks. Best effort: silence on every failure.
pub(crate) fn coax_frontmost_into_answering() {
    if !is_trusted() {
        return;
    }
    let Some(pid) = frontmost_application_pid() else {
        return;
    };
    let app_ref = unsafe { AXUIElementCreateApplication(pid) };
    if app_ref.is_null() {
        return;
    }
    let app = unsafe { CFType::wrap_under_create_rule(app_ref) };
    let attribute = CFString::from_static_string(AX_MANUAL_ACCESSIBILITY_ATTRIBUTE);
    let manual_on = core_foundation::boolean::CFBoolean::true_value();
    unsafe {
        AXUIElementSetAttributeValue(
            app.as_CFTypeRef(),
            attribute.as_concrete_TypeRef(),
            manual_on.as_CFTypeRef(),
        );
    }
}

fn frontmost_application_pid() -> Option<libc::pid_t> {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    objc2::rc::autoreleasepool(|_| unsafe {
        let workspace: *mut AnyObject = msg_send![objc2::class!(NSWorkspace), sharedWorkspace];
        if workspace.is_null() {
            return None;
        }
        let app: *mut AnyObject = msg_send![workspace, frontmostApplication];
        if app.is_null() {
            return None;
        }
        let pid: i32 = msg_send![app, processIdentifier];
        (pid > 0).then_some(pid)
    })
}

pub(crate) fn sight_focused_caret() -> CaretSight {
    if !is_trusted() {
        return CaretSight::Blind;
    }
    let Ok(AttributeRead::Value(focused)) = focused_element() else {
        return CaretSight::Blind;
    };
    if element_belongs_to_echo(&focused) {
        return CaretSight::Blind;
    }
    // Only the role affirms — Finder's desktop answers AXSelectedTextRange on a plain AXGroup, so
    // a selection range proves nothing about a caret.
    match focused_role(&focused).as_deref() {
        Some(role) if role_is_text_input(role) => CaretSight::Affirmed,
        Some(role) if role_is_paste_deaf(role) => CaretSight::DeniedByRole,
        _ => CaretSight::Blind,
    }
}

fn focused_role(focused: &CFType) -> Option<String> {
    match copy_attribute(focused.as_CFTypeRef(), AX_ROLE_ATTRIBUTE) {
        Ok(AttributeRead::Value(role)) => role
            .downcast_into::<CFString>()
            .map(|name| name.to_string()),
        _ => None,
    }
}

fn role_is_text_input(role: &str) -> bool {
    TEXT_INPUT_ROLES.contains(&role)
}

fn role_is_paste_deaf(role: &str) -> bool {
    PASTE_DEAF_ROLES.contains(&role)
}

fn selected_text_from_element(focused: &CFType) -> Result<SelectedText> {
    let selected = match copy_attribute(focused.as_CFTypeRef(), AX_SELECTED_TEXT_ATTRIBUTE)? {
        AttributeRead::Value(value) => value,
        AttributeRead::Missing => return Ok(SelectedText::Empty),
        AttributeRead::Unsupported => return Ok(SelectedText::Unavailable),
    };
    let Some(text) = selected.downcast_into::<CFString>() else {
        return Ok(SelectedText::Unavailable);
    };
    let text = text.to_string();
    if text.trim().is_empty() {
        return Ok(SelectedText::Empty);
    }
    Ok(SelectedText::Text(text))
}

pub(crate) fn focused_application_pid() -> Option<libc::pid_t> {
    match focused_element().ok()? {
        AttributeRead::Value(element) => element_pid(&element),
        AttributeRead::Missing | AttributeRead::Unsupported => None,
    }
}

fn focused_element() -> Result<AttributeRead> {
    let system_ref = unsafe { AXUIElementCreateSystemWide() };
    if system_ref.is_null() {
        return Ok(AttributeRead::Unsupported);
    }
    let system = unsafe { CFType::wrap_under_create_rule(system_ref) };
    copy_attribute(system.as_CFTypeRef(), AX_FOCUSED_UI_ELEMENT_ATTRIBUTE)
}

fn element_pid(element: &CFType) -> Option<libc::pid_t> {
    let mut pid = 0;
    let status = unsafe { AXUIElementGetPid(element.as_CFTypeRef(), &mut pid) };
    (status == AX_ERROR_SUCCESS && pid > 0).then_some(pid)
}

fn copy_attribute(element: AXUIElementRef, attribute: &'static str) -> Result<AttributeRead> {
    let attribute = CFString::from_static_string(attribute);
    let mut value = ptr::null();
    let status = unsafe {
        AXUIElementCopyAttributeValue(element, attribute.as_concrete_TypeRef(), &mut value)
    };
    match status {
        AX_ERROR_SUCCESS if value.is_null() => Ok(AttributeRead::Missing),
        AX_ERROR_SUCCESS => Ok(AttributeRead::Value(unsafe {
            CFType::wrap_under_create_rule(value)
        })),
        AX_ERROR_ATTRIBUTE_UNSUPPORTED => Ok(AttributeRead::Unsupported),
        AX_ERROR_NO_VALUE => Ok(AttributeRead::Missing),
        AX_ERROR_API_DISABLED => Ok(AttributeRead::Unsupported),
        _ => Err(anyhow::anyhow!(
            "Accessibility selection read failed with code {status}"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{role_is_paste_deaf, role_is_text_input};
    use crate::caret::CaretSight;

    #[test]
    fn text_input_roles_affirm_a_caret() {
        for role in ["AXTextArea", "AXTextField", "AXComboBox", "AXSearchField"] {
            assert!(role_is_text_input(role));
            assert!(!role_is_paste_deaf(role));
        }
    }

    /// A web area with nothing editable, a button, the desktop — clear focus, no possible caret.
    #[test]
    fn roles_that_cannot_take_a_paste_deny_the_caret() {
        for role in ["AXWebArea", "AXScrollArea", "AXButton", "AXStaticText"] {
            assert!(role_is_paste_deaf(role));
            assert!(!role_is_text_input(role));
        }
    }

    /// A bare window or group says nothing — AX-poor apps (terminals, Zed) look like this while
    /// taking pastes perfectly well, so they must stay blind, never denied.
    #[test]
    fn uninformative_roles_stay_blind() {
        for role in ["AXWindow", "AXGroup", "AXSplitGroup", "AXUnknown"] {
            assert!(!role_is_paste_deaf(role));
            assert!(!role_is_text_input(role));
        }
    }

    #[test]
    fn sight_orders_by_how_much_the_probe_established() {
        assert!(CaretSight::Affirmed > CaretSight::DeniedByRole);
        assert!(CaretSight::DeniedByRole > CaretSight::Blind);
    }
}
