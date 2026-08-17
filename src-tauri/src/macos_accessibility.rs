use anyhow::Result;
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use std::ffi::c_void;
use std::ptr;
use std::sync::Mutex;

const AX_ERROR_ATTRIBUTE_UNSUPPORTED: i32 = -25_205;
const AX_ERROR_API_DISABLED: i32 = -25_211;
const AX_ERROR_NO_VALUE: i32 = -25_212;
const AX_ERROR_SUCCESS: i32 = 0;
const AX_FOCUSED_UI_ELEMENT_ATTRIBUTE: &str = "AXFocusedUIElement";
const AX_SELECTED_TEXT_ATTRIBUTE: &str = "AXSelectedText";
static LAST_EXTERNAL_SELECTION: Mutex<Option<SelectedText>> = Mutex::new(None);

type AXUIElementRef = *const c_void;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SelectedText {
    Empty,
    PermissionRequired,
    Text(String),
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
    let focused = match focused_element()? {
        AttributeRead::Value(value) => value,
        AttributeRead::Missing => return Ok(SelectedText::Empty),
        AttributeRead::Unsupported => return Ok(SelectedText::Unavailable),
    };
    if let Some(selection) = selection_during_overlay_focus(
        element_pid(&focused),
        i32::try_from(std::process::id()).ok(),
        cached_external_selection(),
    ) {
        return Ok(selection);
    }
    let selection = selected_text_from_element(&focused)?;
    remember_external_selection(&selection);
    Ok(selection)
}
pub(crate) fn remember_selected_text_before_overlay_focus() {
    match selected_text() {
        Ok(selection) => remember_external_selection(&selection),
        Err(_) => replace_external_selection(None),
    }
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

fn remember_external_selection(selection: &SelectedText) {
    let remembered = match selection {
        SelectedText::Empty | SelectedText::Text(_) => Some(selection.clone()),
        SelectedText::PermissionRequired | SelectedText::Unavailable => None,
    };
    replace_external_selection(remembered);
}

fn replace_external_selection(selection: Option<SelectedText>) {
    match LAST_EXTERNAL_SELECTION.lock() {
        Ok(mut current) => *current = selection,
        Err(poisoned) => *poisoned.into_inner() = selection,
    }
}

fn cached_external_selection() -> Option<SelectedText> {
    match LAST_EXTERNAL_SELECTION.lock() {
        Ok(current) => current.clone(),
        Err(poisoned) => poisoned.into_inner().clone(),
    }
}

fn selection_during_overlay_focus(
    focused_pid: Option<libc::pid_t>,
    echo_pid: Option<libc::pid_t>,
    cached: Option<SelectedText>,
) -> Option<SelectedText> {
    echo_pid
        .filter(|pid| focused_pid == Some(*pid))
        .map(|_| cached.unwrap_or(SelectedText::Unavailable))
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
    use super::{selection_during_overlay_focus, SelectedText};

    #[test]
    fn selected_text_survives_the_overlay_taking_focus() {
        let selected = SelectedText::Text("Damn, how despicable".to_string());

        assert_eq!(
            selection_during_overlay_focus(Some(42), Some(42), Some(selected.clone())),
            Some(selected)
        );
        assert_eq!(
            selection_during_overlay_focus(Some(7), Some(42), None),
            None
        );
    }

    #[test]
    fn missing_cached_text_stays_unavailable_while_echo_has_focus() {
        assert_eq!(
            selection_during_overlay_focus(Some(42), Some(42), None),
            Some(SelectedText::Unavailable)
        );
    }
}
