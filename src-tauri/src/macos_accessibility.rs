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
const AX_SELECTED_TEXT_ATTRIBUTE: &str = "AXSelectedText";
const AX_SELECTED_TEXT_RANGE_ATTRIBUTE: &str = "AXSelectedTextRange";

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
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut libc::pid_t) -> i32;
}

pub(crate) fn selected_text() -> Result<SelectedText> {
    if unsafe { AXIsProcessTrusted() } == 0 {
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

/// A synthetic Cmd+V needs somewhere to land: an insertion point outside Echo. Without Accessibility
/// permission nothing can be known, so the paste goes out blind exactly as it always did.
pub(crate) fn caret_is_reachable() -> bool {
    if unsafe { AXIsProcessTrusted() } == 0 {
        return true;
    }
    match focused_element() {
        Ok(AttributeRead::Value(focused)) => element_holds_a_caret(&focused),
        Ok(AttributeRead::Missing) => false,
        Ok(AttributeRead::Unsupported) | Err(_) => true,
    }
}

fn element_holds_a_caret(focused: &CFType) -> bool {
    if element_belongs_to_echo(focused) {
        return false;
    }
    matches!(
        copy_attribute(focused.as_CFTypeRef(), AX_SELECTED_TEXT_RANGE_ATTRIBUTE),
        Ok(AttributeRead::Value(_))
    )
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
