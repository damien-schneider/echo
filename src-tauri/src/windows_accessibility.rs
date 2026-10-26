use crate::caret::CaretSight;
use crate::managers::timeout::run_with_timeout;
use std::time::Duration;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, UIA_ButtonControlTypeId, UIA_CheckBoxControlTypeId,
    UIA_DataGridControlTypeId, UIA_DataItemControlTypeId, UIA_EditControlTypeId,
    UIA_HyperlinkControlTypeId, UIA_ImageControlTypeId, UIA_ListControlTypeId,
    UIA_ListItemControlTypeId, UIA_MenuBarControlTypeId, UIA_MenuControlTypeId,
    UIA_MenuItemControlTypeId, UIA_RadioButtonControlTypeId, UIA_SplitButtonControlTypeId,
    UIA_TabControlTypeId, UIA_TabItemControlTypeId, UIA_TableControlTypeId,
    UIA_ToolBarControlTypeId, UIA_TreeControlTypeId, UIA_TreeItemControlTypeId, UIA_CONTROLTYPE_ID,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, GUITHREADINFO,
};

/// A hung app answers UI Automation late or never, and recording start and stop wait on this.
const UI_AUTOMATION_BUDGET: Duration = Duration::from_millis(200);

/// Document and Text stay out: Chromium pages, Word and terminals report one of them.
const PASTE_DEAF_CONTROLS: &[UIA_CONTROLTYPE_ID] = &[
    UIA_ButtonControlTypeId,
    UIA_CheckBoxControlTypeId,
    UIA_DataGridControlTypeId,
    UIA_DataItemControlTypeId,
    UIA_HyperlinkControlTypeId,
    UIA_ImageControlTypeId,
    UIA_ListControlTypeId,
    UIA_ListItemControlTypeId,
    UIA_MenuBarControlTypeId,
    UIA_MenuControlTypeId,
    UIA_MenuItemControlTypeId,
    UIA_RadioButtonControlTypeId,
    UIA_SplitButtonControlTypeId,
    UIA_TabControlTypeId,
    UIA_TabItemControlTypeId,
    UIA_TableControlTypeId,
    UIA_ToolBarControlTypeId,
    UIA_TreeControlTypeId,
    UIA_TreeItemControlTypeId,
];

/// Chromium and WPF edit text without a Win32 caret, so a missing caret falls through to the
/// focused element's UI Automation control type.
pub(crate) fn sight_focused_caret() -> CaretSight {
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_invalid() {
        return CaretSight::Blind;
    }
    let mut process_id = 0;
    let thread = unsafe { GetWindowThreadProcessId(foreground, Some(&mut process_id)) };
    if win32_caret_is_up(thread) {
        return CaretSight::Affirmed;
    }
    if process_id == std::process::id() {
        return CaretSight::Blind;
    }
    run_with_timeout(focused_control_sight, UI_AUTOMATION_BUDGET).unwrap_or(CaretSight::Blind)
}

fn win32_caret_is_up(thread: u32) -> bool {
    let Ok(size) = u32::try_from(std::mem::size_of::<GUITHREADINFO>()) else {
        return false;
    };
    let mut info = GUITHREADINFO {
        cbSize: size,
        ..Default::default()
    };
    unsafe { GetGUIThreadInfo(thread, &mut info) }.is_ok() && !info.hwndCaret.is_invalid()
}

fn focused_control_sight() -> CaretSight {
    let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
    let sight = focused_control_type().map_or(CaretSight::Blind, sight_for_control);
    if initialized {
        unsafe { CoUninitialize() };
    }
    sight
}

fn focused_control_type() -> windows::core::Result<UIA_CONTROLTYPE_ID> {
    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }?;
    let focused = unsafe { automation.GetFocusedElement() }?;
    unsafe { focused.CurrentControlType() }
}

fn sight_for_control(control: UIA_CONTROLTYPE_ID) -> CaretSight {
    if control == UIA_EditControlTypeId {
        CaretSight::Affirmed
    } else if PASTE_DEAF_CONTROLS.contains(&control) {
        CaretSight::DeniedByRole
    } else {
        CaretSight::Blind
    }
}
