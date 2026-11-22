use std::sync::mpsc;
use std::time::Duration;

use windows::core::Result;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationTextPattern, UIA_TextPatternId,
};

use super::DirectSelection;

/// A provider that hangs past this must not stall the shortcut; its worker finishes on its own.
const PROVIDER_TIMEOUT: Duration = Duration::from_millis(300);
/// The text control is the focused element or a near ancestor (a span inside a document).
const ANCESTORS_SEARCHED: usize = 8;

pub(super) fn selected_text() -> DirectSelection {
    let (sender, receiver) = mpsc::channel();
    let spawned = std::thread::Builder::new()
        .name("echo-uia-selection".to_string())
        .spawn(move || {
            let _ = sender.send(read_on_com_thread());
        });
    if spawned.is_err() {
        return DirectSelection::Unavailable;
    }
    receiver
        .recv_timeout(PROVIDER_TIMEOUT)
        .unwrap_or(DirectSelection::Unavailable)
}

fn read_on_com_thread() -> DirectSelection {
    if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
        return DirectSelection::Unavailable;
    }
    let selection = focused_selection().unwrap_or(DirectSelection::Unavailable);
    unsafe { CoUninitialize() };
    selection
}

fn focused_selection() -> Result<DirectSelection> {
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }?;
    let focused = unsafe { automation.GetFocusedElement() }?;
    if unsafe { focused.CurrentProcessId() }? as u32 == unsafe { GetCurrentProcessId() } {
        return Ok(DirectSelection::Unavailable);
    }
    let Some(pattern) = text_pattern(&automation, focused)? else {
        return Ok(DirectSelection::Unavailable);
    };
    let ranges = unsafe { pattern.GetSelection() }?;
    let mut texts = Vec::new();
    for index in 0..unsafe { ranges.Length() }? {
        let text = unsafe { ranges.GetElement(index)?.GetText(-1) }?.to_string();
        if !text.is_empty() {
            texts.push(text);
        }
    }
    Ok(if texts.is_empty() {
        DirectSelection::Empty
    } else {
        DirectSelection::Text(texts.join("\n"))
    })
}

fn text_pattern(
    automation: &IUIAutomation,
    focused: IUIAutomationElement,
) -> Result<Option<IUIAutomationTextPattern>> {
    let walker = unsafe { automation.ControlViewWalker() }?;
    let mut element = focused;
    for _ in 0..ANCESTORS_SEARCHED {
        if let Ok(pattern) =
            unsafe { element.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId) }
        {
            return Ok(Some(pattern));
        }
        let Ok(parent) = (unsafe { walker.GetParentElement(&element) }) else {
            return Ok(None);
        };
        element = parent;
    }
    Ok(None)
}
