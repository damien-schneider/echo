#![cfg(unix)]

use crate::features::polish::app_exit;
use crate::features::shortcut::init::toggle_dictation;
use crate::process_exit::exit_without_destructors;
use log::{debug, info, warn};
use std::thread;
use tauri::AppHandle;

use signal_hook::consts::{SIGINT, SIGTERM, SIGUSR2};
use signal_hook::iterator::Signals;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SignalAction {
    ToggleTranscription,
    ExitWithoutDestructors(i32),
    Ignore,
}

fn signal_action(signal: i32) -> SignalAction {
    match signal {
        SIGUSR2 => SignalAction::ToggleTranscription,
        SIGINT | SIGTERM => SignalAction::ExitWithoutDestructors(128 + signal),
        _ => SignalAction::Ignore,
    }
}

pub fn setup_signal_handler(app_handle: AppHandle, mut signals: Signals) {
    debug!("Unix signal handler registered successfully");
    thread::spawn(move || {
        debug!("Unix signal handler thread started");
        for sig in signals.forever() {
            match signal_action(sig) {
                SignalAction::ToggleTranscription => {
                    debug!("SIGUSR2: toggling transcription");
                    toggle_dictation(&app_handle, "transcribe", "SIGUSR2");
                }
                SignalAction::ExitWithoutDestructors(exit_code) => {
                    info!("Received termination signal {sig}");
                    run_termination(
                        exit_code,
                        || app_exit::shutdown(&app_handle),
                        exit_without_destructors,
                    );
                }
                SignalAction::Ignore => warn!("Ignoring unsupported Unix signal {sig}"),
            }
        }
    });
}

fn run_termination<ExitOutput>(
    exit_code: i32,
    cleanup: impl FnOnce(),
    exit_process: impl FnOnce(i32) -> ExitOutput,
) {
    cleanup();
    let _ = exit_process(exit_code);
}

#[cfg(test)]
mod tests {
    use super::{signal_action, SignalAction};
    use signal_hook::consts::{SIGINT, SIGTERM, SIGUSR2};
    use std::cell::RefCell;
    use std::rc::Rc;

    #[test]
    fn sigusr2_routes_to_transcription_toggle() {
        assert_eq!(signal_action(SIGUSR2), SignalAction::ToggleTranscription);
    }

    #[test]
    fn termination_signals_bypass_process_destructors() {
        assert_eq!(
            signal_action(SIGINT),
            SignalAction::ExitWithoutDestructors(128 + SIGINT)
        );
        assert_eq!(
            signal_action(SIGTERM),
            SignalAction::ExitWithoutDestructors(128 + SIGTERM)
        );
    }

    #[test]
    fn termination_cleans_the_sidecar_before_exiting_the_process() {
        let calls = Rc::new(RefCell::new(Vec::new()));
        let cleanup_calls = Rc::clone(&calls);
        let exit_calls = Rc::clone(&calls);

        super::run_termination(
            143,
            move || cleanup_calls.borrow_mut().push("cleanup".to_string()),
            move |code| exit_calls.borrow_mut().push(format!("exit:{code}")),
        );

        assert_eq!(calls.borrow().as_slice(), ["cleanup", "exit:143"]);
    }
}
