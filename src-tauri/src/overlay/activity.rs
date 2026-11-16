use super::generation::{OverlayGeneration, OverlayGenerationToken};
#[cfg(target_os = "linux")]
use super::layout::{update_wayland_anchors, OverlayPlacement};
use super::live_dictation;
#[cfg(target_os = "linux")]
use super::window::RECORDING_OVERLAY_LABEL;
use super::window_modes::{self, update_overlay_position};
use super::window_setup;
use crate::settings::{self, OverlayPosition};
use log::{debug, info, warn};
use std::time::Duration;
#[cfg(target_os = "linux")]
use tauri::Manager;
use tauri::{AppHandle, Emitter};

static OVERLAY_GENERATION: OverlayGeneration = OverlayGeneration::new();

const WARNING_STATE: &str = "warning";

/// What the island offers to do about the message it carries — `None` leaves it read-only.
pub(crate) const DOWNLOAD_TRANSCRIPTION_MODEL: &str = "download_transcription_model";

struct OverlayPresentation<'a> {
    action: Option<&'static str>,
    state: &'a str,
    message: &'a str,
    duration: Option<Duration>,
}

struct PendingOverlayPresentation {
    action: Option<&'static str>,
    duration: Option<Duration>,
    generation: OverlayGenerationToken,
    message: String,
    state: String,
}

type MainThreadMutation = Box<dyn FnOnce() + Send + 'static>;

/// Hiding the overlay silences progress, not the reason a dictation did not happen.
fn reaches_hidden_overlay(state: &str) -> bool {
    state == WARNING_STATE
}

/// Progress the hidden overlay does not draw still ends the notice it replaces, whose own expiry it cancelled.
fn withdraw_notice(app_handle: &AppHandle) {
    let _ = app_handle.emit("hide-overlay", ());
}

#[cfg(target_os = "linux")]
fn present_hud_on_gnome(app_handle: &AppHandle) {
    if !crate::wayland::is_wayland() {
        return;
    }
    if let Some(hud) = app_handle.get_webview_window(RECORDING_OVERLAY_LABEL) {
        crate::wayland::present_gnome_overlay(&hud);
    }
}

/// run_on_main_thread required for Wayland GTK/layer-shell.
pub(crate) fn show_preparing_overlay(app_handle: &AppHandle) {
    let generation = OVERLAY_GENERATION.begin();
    let app_handle = app_handle.clone();
    let app_handle_inner = app_handle.clone();

    let result = app_handle.run_on_main_thread(move || {
        if !OVERLAY_GENERATION.is_current(generation) {
            return;
        }
        let closure_start = std::time::Instant::now();
        let app_handle = app_handle_inner;
        window_setup::retry_overlay_awaiting_screen(&app_handle);
        let settings = settings::get_settings(&app_handle);
        if settings.overlay_position == OverlayPosition::None {
            withdraw_notice(&app_handle);
            return;
        }

        update_overlay_position(&app_handle);
        info!(
            "[Overlay] main-thread show closure: position computed in {:?}",
            closure_start.elapsed()
        );

        debug!("[Overlay] Showing recording overlay");
        #[cfg(target_os = "linux")]
        if let Some(hud) = app_handle.get_webview_window(RECORDING_OVERLAY_LABEL) {
            update_wayland_anchors(&hud, OverlayPlacement::from_settings(&settings));
        }
        let _ = app_handle.emit("show-overlay", "preparing");
    });
    if let Err(error) = result {
        warn!("[Overlay] Failed to schedule recording overlay: {error}");
    }
}

/// Rides the main thread so it lands after the preparing show it replaces, and only while that recording is still live.
pub(crate) fn mark_recording_live(app_handle: &AppHandle) {
    let app_handle = app_handle.clone();
    let app_handle_inner = app_handle.clone();
    let result = app_handle.run_on_main_thread(move || {
        let app_handle = app_handle_inner;
        if live_dictation::shown_phase(&app_handle) == Some(live_dictation::RECORDING) {
            let _ = app_handle.emit("show-overlay", live_dictation::RECORDING);
        }
    });
    if let Err(error) = result {
        warn!("[Overlay] Failed to mark the recording live: {error}");
    }
}

pub(crate) fn show_transcribing_overlay(app_handle: &AppHandle) {
    let generation = OVERLAY_GENERATION.begin();
    let app_handle = app_handle.clone();
    let app_handle_inner = app_handle.clone();

    let result = app_handle.run_on_main_thread(move || {
        if !OVERLAY_GENERATION.is_current(generation) {
            return;
        }
        let app_handle = app_handle_inner;
        let settings = settings::get_settings(&app_handle);
        if settings.overlay_position == OverlayPosition::None {
            withdraw_notice(&app_handle);
            return;
        }

        update_overlay_position(&app_handle);

        #[cfg(target_os = "linux")]
        present_hud_on_gnome(&app_handle);
        let _ = app_handle.emit("show-overlay", "transcribing");
    });
    if let Err(error) = result {
        warn!("[Overlay] Failed to schedule transcribing overlay: {error}");
    }
}

const SHORTEST_WARNING: Duration = Duration::from_secs(2);
const LONGEST_WARNING: Duration = Duration::from_secs(8);
const READING_TIME_PER_WORD: Duration = Duration::from_millis(400);

fn warning_duration(message: &str) -> Duration {
    let words = u32::try_from(message.split_whitespace().count()).unwrap_or(u32::MAX);
    READING_TIME_PER_WORD
        .saturating_mul(words)
        .clamp(SHORTEST_WARNING, LONGEST_WARNING)
}

/// Once read, the island goes back to the dictation under it, or hides when there is none.
pub(crate) fn show_warning_overlay(app_handle: &AppHandle, message: &str) {
    show_overlay_presentation(
        app_handle,
        OverlayPresentation {
            action: None,
            state: WARNING_STATE,
            message,
            duration: Some(warning_duration(message)),
        },
    );
}

/// A block the user can clear from the island: it waits, and hands over the download that lifts it.
pub(crate) fn show_model_required_overlay(app_handle: &AppHandle, message: &str) {
    show_overlay_presentation(
        app_handle,
        OverlayPresentation {
            action: Some(DOWNLOAD_TRANSCRIPTION_MODEL),
            state: WARNING_STATE,
            message,
            duration: None,
        },
    );
}

pub(crate) fn show_tool_overlay(app_handle: &AppHandle, message: &str) {
    show_overlay_presentation(
        app_handle,
        OverlayPresentation {
            action: None,
            state: "tool",
            message,
            duration: Some(Duration::from_secs(3)),
        },
    );
}

pub(crate) fn show_processing_overlay(app_handle: &AppHandle, message: &str) {
    show_overlay_presentation(
        app_handle,
        OverlayPresentation {
            action: None,
            state: "processing",
            message,
            duration: None,
        },
    );
}

fn show_overlay_presentation(app_handle: &AppHandle, presentation: OverlayPresentation<'_>) {
    let pending = PendingOverlayPresentation {
        action: presentation.action,
        duration: presentation.duration,
        generation: OVERLAY_GENERATION.begin(),
        message: presentation.message.to_string(),
        state: presentation.state.to_string(),
    };
    let dispatch_handle = app_handle.clone();
    let mutation_handle = app_handle.clone();
    let result = dispatch_main_thread_mutation(
        move |mutation| {
            dispatch_handle
                .run_on_main_thread(mutation)
                .map_err(|error| error.to_string())
        },
        move || render_overlay_presentation(&mutation_handle, pending),
    );
    if let Err(error) = result {
        warn!("[Overlay] Failed to schedule temporary overlay: {error}");
    }
}

fn dispatch_main_thread_mutation(
    dispatch: impl FnOnce(MainThreadMutation) -> Result<(), String>,
    mutation: impl FnOnce() + Send + 'static,
) -> Result<(), String> {
    dispatch(Box::new(mutation))
}

fn render_overlay_presentation(app_handle: &AppHandle, pending: PendingOverlayPresentation) {
    if !OVERLAY_GENERATION.is_current(pending.generation) {
        return;
    }
    window_setup::retry_overlay_awaiting_screen(app_handle);
    let overlay_is_off =
        settings::get_settings(app_handle).overlay_position == OverlayPosition::None;
    if overlay_is_off && !reaches_hidden_overlay(&pending.state) {
        withdraw_notice(app_handle);
        return;
    }
    if overlay_is_off {
        window_modes::keep_notice_drawn();
    }

    update_overlay_position(app_handle);

    #[cfg(target_os = "linux")]
    if !overlay_is_off {
        present_hud_on_gnome(app_handle);
    }
    let _ = app_handle.emit(
        "show-overlay",
        serde_json::json!({
            "action": pending.action,
            "state": pending.state,
            "message": pending.message
        }),
    );

    if let Some(duration) = pending.duration {
        expire_notice_after(app_handle, pending.generation, duration);
    }
}

/// Decided on the main thread, where every show is emitted — a newer state can no longer slip in between the check and the hide.
fn expire_notice_after(
    app_handle: &AppHandle,
    generation: OverlayGenerationToken,
    duration: Duration,
) {
    let app_handle = app_handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(duration);
        let main_handle = app_handle.clone();
        let result = app_handle.run_on_main_thread(move || {
            if OVERLAY_GENERATION.is_current(generation) {
                live_dictation::end_notice(&main_handle);
            }
        });
        if let Err(error) = result {
            warn!("[Overlay] Failed to schedule the notice expiry: {error}");
        }
    });
}

/// Always hides regardless of settings — handles mid-recording setting change.
pub(crate) fn hide_recording_overlay(app_handle: &AppHandle) {
    OVERLAY_GENERATION.begin();
    let _ = app_handle.emit("hide-overlay", ());
}

pub(crate) fn emit_levels(app_handle: &AppHandle, levels: &[f32]) {
    let _ = app_handle.emit("mic-level", levels);
}

pub(crate) fn emit_transcription_progress(app_handle: &AppHandle, text: &str) {
    let _ = app_handle.emit("transcription-progress", text);
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::time::Duration;

    #[test]
    fn a_warning_still_reaches_the_user_with_the_overlay_hidden() {
        assert!(super::reaches_hidden_overlay("warning"));
    }

    #[test]
    fn a_few_words_of_warning_leave_after_two_seconds() {
        assert_eq!(
            super::warning_duration("No speech detected"),
            Duration::from_secs(2)
        );
    }

    #[test]
    fn a_warning_that_is_a_whole_sentence_stays_long_enough_to_be_read() {
        let sentence =
            "Allow Echo in Accessibility settings to paste — your text is on the clipboard";

        assert!(super::warning_duration(sentence) >= Duration::from_secs(5));
    }

    #[test]
    fn no_warning_holds_the_island_longer_than_eight_seconds() {
        let rambling = "word ".repeat(80);

        assert_eq!(super::warning_duration(&rambling), Duration::from_secs(8));
    }

    #[test]
    fn progress_and_tool_notices_stay_off_screen_with_the_overlay_hidden() {
        for state in [
            "preparing",
            "recording",
            "transcribing",
            "processing",
            "tool",
        ] {
            assert!(!super::reaches_hidden_overlay(state), "{state}");
        }
    }

    #[test]
    fn temporary_overlay_mutation_runs_inside_main_thread_dispatch() {
        let entered_dispatch = Arc::new(AtomicBool::new(false));
        let mutation_ran_on_dispatch = Arc::new(AtomicBool::new(false));
        let dispatch_flag = Arc::clone(&entered_dispatch);
        let mutation_dispatch_flag = Arc::clone(&entered_dispatch);
        let mutation_result = Arc::clone(&mutation_ran_on_dispatch);

        let result = super::dispatch_main_thread_mutation(
            move |mutation| {
                dispatch_flag.store(true, Ordering::Release);
                mutation();
                Ok(())
            },
            move || {
                mutation_result.store(
                    mutation_dispatch_flag.load(Ordering::Acquire),
                    Ordering::Release,
                );
            },
        );

        assert!(result.is_ok());
        assert!(mutation_ran_on_dispatch.load(Ordering::Acquire));
    }
}
