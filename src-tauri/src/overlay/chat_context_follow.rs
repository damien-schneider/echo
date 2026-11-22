use super::events;
use crate::features::polish::chat_context::{ChatContextCapture, ShownChatContext};
use crate::features::polish::manager::PolishManager;
use crate::features::polish::DirectSelection;
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::time::Interval;

const CHAT_CONTEXT_WATCH_INTERVAL: Duration = Duration::from_millis(350);

enum ChatContextRead {
    Accessibility,
    #[cfg(target_os = "macos")]
    AfterSelectionGesture,
}

pub(super) fn log_chat_context_capture(capture: &ChatContextCapture) {
    match capture {
        ChatContextCapture::PermissionRequired => {
            log::warn!("Chat cannot read selected text without Accessibility access");
        }
        ChatContextCapture::Ready(Some(context)) => {
            log::info!("Chat attached {} selected characters", context.text.len());
        }
        ChatContextCapture::Ready(None) => {
            log::info!("Chat found no selected text");
        }
    }
}

/// Follows the selection while the user's app owns the keyboard; while chat owns it, nothing can change.
pub(super) async fn watch_chat_context(
    app_handle: AppHandle,
    manager: Arc<PolishManager>,
    request: events::NotificationRequestEvent,
    mut shown: ShownChatContext,
) {
    let mut interval = tokio::time::interval(CHAT_CONTEXT_WATCH_INTERVAL);
    interval.tick().await;
    loop {
        let read = next_read(&mut interval).await;
        if !events::notification_request_is_current(request) {
            return;
        }
        let changed = match read {
            ChatContextRead::Accessibility => shown.absorb(observed_selection(&manager).await),
            #[cfg(target_os = "macos")]
            ChatContextRead::AfterSelectionGesture => {
                follow_selection_gesture(&app_handle, &manager, &mut shown).await
            }
        };
        if !changed {
            continue;
        }
        log_chat_context_capture(&shown.capture);
        let generation = events::current_chat_context_generation();
        if let Err(error) =
            events::emit_chat_context_capture(&app_handle, generation, &shown.capture)
        {
            log::warn!("{error}");
        }
    }
}

#[cfg(target_os = "macos")]
async fn next_read(interval: &mut Interval) -> ChatContextRead {
    tokio::select! {
        _ = interval.tick() => ChatContextRead::Accessibility,
        () = super::macos_selection_gesture::selection_gesture_ended() => {
            ChatContextRead::AfterSelectionGesture
        }
    }
}

#[cfg(not(target_os = "macos"))]
async fn next_read(interval: &mut Interval) -> ChatContextRead {
    interval.tick().await;
    ChatContextRead::Accessibility
}

/// Reading can wait on a slow app, so it runs off the async workers.
async fn observed_selection(manager: &Arc<PolishManager>) -> DirectSelection {
    let reader = Arc::clone(manager);
    tauri::async_runtime::spawn_blocking(move || reader.observe_selected_text())
        .await
        .map_err(anyhow::Error::from)
        .and_then(|read| read)
        .unwrap_or_else(|error| {
            log::debug!("Could not refresh selected Chat text: {error:#}");
            DirectSelection::Unavailable
        })
}

/// Only an app accessibility is blind to gets the copy shortcut, and only once the user has finished selecting.
#[cfg(target_os = "macos")]
async fn follow_selection_gesture(
    app_handle: &AppHandle,
    manager: &Arc<PolishManager>,
    shown: &mut ShownChatContext,
) -> bool {
    let observed = observed_selection(manager).await;
    if observed != DirectSelection::Unavailable {
        return shown.absorb(observed);
    }
    let _copy_reaches_the_app = super::OverlaySyntheticKeyGuard::acquire(app_handle);
    match manager.copy_selection_for_chat().await {
        Ok(copied) => shown.absorb_copy(copied),
        Err(error) => {
            log::debug!("Could not copy the selection for Chat: {error:#}");
            false
        }
    }
}
