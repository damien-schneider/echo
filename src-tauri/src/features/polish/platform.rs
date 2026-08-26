mod pasteboard_types;

#[cfg(target_os = "windows")]
use anyhow::Context;
use anyhow::Result;
#[cfg(target_os = "windows")]
use clipboard_rs::{common::RustImage, ContentFormat};
use clipboard_rs::{Clipboard, ClipboardContent, ClipboardContext};
use std::sync::Mutex;

#[cfg(not(target_os = "linux"))]
use crate::managers::app_context::{FocusedAppProvider, PlatformFocusedAppProvider};

#[cfg(target_os = "windows")]
use super::selection::ClipboardFormat;
use super::selection::{ClipboardPort, ClipboardSnapshot, FocusPort, KeyboardPort};
#[cfg(not(target_os = "windows"))]
use pasteboard_types::{restorable_formats, FormatNaming};

#[cfg(target_os = "macos")]
fn platform_format_naming() -> FormatNaming {
    FormatNaming::UniformTypeIdentifiers
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_format_naming() -> FormatNaming {
    FormatNaming::Opaque
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DirectSelection {
    Empty,
    PermissionRequired,
    Text(String),
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum SettledSelection {
    PermissionRequired,
    Text(String),
}

/// Accessibility proves a selection but never its absence: a focused composer answers "nothing" while the page around it is highlighted.
pub(crate) fn settled_selection(observed: DirectSelection) -> Option<SettledSelection> {
    match observed {
        DirectSelection::PermissionRequired => Some(SettledSelection::PermissionRequired),
        DirectSelection::Text(text) => Some(SettledSelection::Text(text)),
        DirectSelection::Empty | DirectSelection::Unavailable => None,
    }
}

pub(super) fn read_selected_text() -> Result<DirectSelection> {
    #[cfg(target_os = "macos")]
    return Ok(match crate::macos_accessibility::selected_text()? {
        crate::macos_accessibility::SelectedText::Empty => DirectSelection::Empty,
        crate::macos_accessibility::SelectedText::PermissionRequired => {
            DirectSelection::PermissionRequired
        }
        crate::macos_accessibility::SelectedText::Text(text) => DirectSelection::Text(text),
        crate::macos_accessibility::SelectedText::Unavailable => DirectSelection::Unavailable,
    });
    #[cfg(not(target_os = "macos"))]
    Ok(DirectSelection::Unavailable)
}

pub(super) struct PlatformClipboard {
    context: Mutex<ClipboardContext>,
}

impl PlatformClipboard {
    pub(super) fn new() -> Result<Self> {
        Ok(Self {
            context: Mutex::new(ClipboardContext::new().map_err(clipboard_error)?),
        })
    }
}

impl ClipboardPort for PlatformClipboard {
    fn snapshot(&self) -> Result<ClipboardSnapshot> {
        let context = self
            .context
            .lock()
            .map_err(|_| anyhow::anyhow!("Clipboard lock is poisoned"))?;
        #[cfg(target_os = "windows")]
        {
            snapshot_windows(&context)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let formats = restorable_formats(
                platform_format_naming(),
                context.available_formats().map_err(clipboard_error)?,
                |name| context.get_buffer(name).map_err(clipboard_error),
            );
            Ok(ClipboardSnapshot { formats })
        }
    }

    fn read_text(&self) -> Result<String> {
        let context = self
            .context
            .lock()
            .map_err(|_| anyhow::anyhow!("Clipboard lock is poisoned"))?;
        context.get_text().map_err(clipboard_error)
    }

    fn write_text(&self, text: &str) -> Result<()> {
        let context = self
            .context
            .lock()
            .map_err(|_| anyhow::anyhow!("Clipboard lock is poisoned"))?;
        context.clear().map_err(clipboard_error)?;
        context
            .set_text(text.to_string())
            .map_err(clipboard_error)?;
        Ok(())
    }

    fn restore(&self, snapshot: &ClipboardSnapshot) -> Result<()> {
        let context = self
            .context
            .lock()
            .map_err(|_| anyhow::anyhow!("Clipboard lock is poisoned"))?;
        #[cfg(target_os = "windows")]
        {
            restore_windows(&context, snapshot)
        }
        #[cfg(not(target_os = "windows"))]
        {
            if snapshot.formats.is_empty() {
                context.clear().map_err(clipboard_error)?;
                return Ok(());
            }
            let contents = snapshot
                .formats
                .iter()
                .map(|format| ClipboardContent::Other(format.name.clone(), format.data.clone()))
                .collect();
            context.set(contents).map_err(clipboard_error)?;
            Ok(())
        }
    }
}

#[cfg(target_os = "windows")]
const ECHO_TEXT: &str = "echo-internal/text";
#[cfg(target_os = "windows")]
const ECHO_RTF: &str = "echo-internal/rtf";
#[cfg(target_os = "windows")]
const ECHO_HTML: &str = "echo-internal/html";
#[cfg(target_os = "windows")]
const ECHO_FILES: &str = "echo-internal/files";
#[cfg(target_os = "windows")]
const ECHO_IMAGE: &str = "echo-internal/image";

#[cfg(target_os = "windows")]
fn snapshot_windows(context: &ClipboardContext) -> Result<ClipboardSnapshot> {
    let mut formats = Vec::new();
    push_text_format(
        context,
        &mut formats,
        WindowsTextFormat::new(ContentFormat::Text, ECHO_TEXT),
    )?;
    push_text_format(
        context,
        &mut formats,
        WindowsTextFormat::new(ContentFormat::Rtf, ECHO_RTF),
    )?;
    push_text_format(
        context,
        &mut formats,
        WindowsTextFormat::new(ContentFormat::Html, ECHO_HTML),
    )?;
    if context.has(ContentFormat::Files) {
        formats.push(ClipboardFormat {
            name: ECHO_FILES.to_string(),
            data: serde_json::to_vec(&context.get_files().map_err(clipboard_error)?)?,
        });
    }
    if context.has(ContentFormat::Image) {
        let image = context.get_image().map_err(clipboard_error)?;
        formats.push(ClipboardFormat {
            name: ECHO_IMAGE.to_string(),
            data: image
                .to_png()
                .map_err(clipboard_error)?
                .get_bytes()
                .to_vec(),
        });
    }
    for name in context.available_formats().map_err(clipboard_error)? {
        if name != "Unknown" {
            if let Ok(data) = context.get_buffer(&name) {
                formats.push(ClipboardFormat { name, data });
            }
        }
    }
    Ok(ClipboardSnapshot { formats })
}

#[cfg(target_os = "windows")]
struct WindowsTextFormat {
    format: ContentFormat,
    name: &'static str,
}

#[cfg(target_os = "windows")]
impl WindowsTextFormat {
    fn new(format: ContentFormat, name: &'static str) -> Self {
        Self { format, name }
    }
}

#[cfg(target_os = "windows")]
fn push_text_format(
    context: &ClipboardContext,
    formats: &mut Vec<ClipboardFormat>,
    text_format: WindowsTextFormat,
) -> Result<()> {
    if !context.has(text_format.format.clone()) {
        return Ok(());
    }
    let text = match text_format.format {
        ContentFormat::Text => context.get_text(),
        ContentFormat::Rtf => context.get_rich_text(),
        ContentFormat::Html => context.get_html(),
        _ => return Ok(()),
    }
    .map_err(clipboard_error)?;
    formats.push(ClipboardFormat {
        name: text_format.name.to_string(),
        data: text.into_bytes(),
    });
    Ok(())
}

#[cfg(target_os = "windows")]
fn restore_windows(context: &ClipboardContext, snapshot: &ClipboardSnapshot) -> Result<()> {
    if snapshot.formats.is_empty() {
        context.clear().map_err(clipboard_error)?;
        return Ok(());
    }
    let mut contents = Vec::new();
    for format in &snapshot.formats {
        contents.push(content_from_snapshot(format)?);
    }
    context.set(contents).map_err(clipboard_error)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn content_from_snapshot(format: &ClipboardFormat) -> Result<ClipboardContent> {
    let text = || String::from_utf8(format.data.clone()).context("Clipboard text is invalid UTF-8");
    match format.name.as_str() {
        ECHO_TEXT => Ok(ClipboardContent::Text(text()?)),
        ECHO_RTF => Ok(ClipboardContent::Rtf(text()?)),
        ECHO_HTML => Ok(ClipboardContent::Html(text()?)),
        ECHO_FILES => Ok(ClipboardContent::Files(serde_json::from_slice(
            &format.data,
        )?)),
        ECHO_IMAGE => Ok(ClipboardContent::Image(
            clipboard_rs::RustImageData::from_bytes(&format.data).map_err(clipboard_error)?,
        )),
        _ => Ok(ClipboardContent::Other(
            format.name.clone(),
            format.data.clone(),
        )),
    }
}

fn clipboard_error(error: impl std::fmt::Display) -> anyhow::Error {
    anyhow::anyhow!(error.to_string())
}

pub(super) struct PlatformKeyboard;

impl KeyboardPort for PlatformKeyboard {
    fn copy(&self) -> Result<()> {
        crate::keystroke::send(crate::keystroke::Shortcut::Copy)
            .map_err(|error| anyhow::anyhow!(error))
    }

    fn paste(&self) -> Result<()> {
        crate::keystroke::send(crate::keystroke::Shortcut::Paste)
            .map_err(|error| anyhow::anyhow!(error))
    }
}

pub(super) struct PlatformFocus;

impl FocusPort for PlatformFocus {
    fn focused_application(&self) -> Option<String> {
        #[cfg(target_os = "linux")]
        return active_x11_window();
        #[cfg(not(target_os = "linux"))]
        let focused = PlatformFocusedAppProvider.current()?;
        #[cfg(not(target_os = "linux"))]
        Some(format!(
            "{}|{}",
            focused.bundle_id.unwrap_or_default(),
            focused.process_name.unwrap_or_default()
        ))
    }
}

#[cfg(target_os = "linux")]
fn active_x11_window() -> Option<String> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};

    let (connection, screen_index) = x11rb::connect(None).ok()?;
    let root = connection.setup().roots.get(screen_index)?.root;
    let atom = connection
        .intern_atom(false, b"_NET_ACTIVE_WINDOW")
        .ok()?
        .reply()
        .ok()?
        .atom;
    let window = connection
        .get_property(false, root, atom, AtomEnum::WINDOW, 0, 1)
        .ok()?
        .reply()
        .ok()?
        .value32()?
        .next()?;
    Some(format!("x11:{window}"))
}

#[cfg(test)]
mod settled_selection_tests {
    use super::*;

    #[test]
    fn an_empty_accessibility_read_leaves_the_capture_to_the_copy_shortcut() {
        assert_eq!(settled_selection(DirectSelection::Empty), None);
        assert_eq!(settled_selection(DirectSelection::Unavailable), None);
        assert_eq!(
            settled_selection(DirectSelection::Text("thread".to_owned())),
            Some(SettledSelection::Text("thread".to_owned()))
        );
        assert_eq!(
            settled_selection(DirectSelection::PermissionRequired),
            Some(SettledSelection::PermissionRequired)
        );
    }
}
