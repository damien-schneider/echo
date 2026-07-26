#![cfg(unix)]

use crate::actions::ACTION_MAP;
use crate::features::polish::manager::PolishManager;
use crate::ManagedToggleState;
use log::{debug, info, warn};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Manager};

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
                SignalAction::ToggleTranscription => toggle_transcription(&app_handle),
                SignalAction::ExitWithoutDestructors(exit_code) => {
                    info!("Received termination signal {sig}");
                    run_termination(
                        exit_code,
                        || shutdown_polish(&app_handle),
                        exit_without_destructors,
                    );
                }
                SignalAction::Ignore => warn!("Ignoring unsupported Unix signal {sig}"),
            }
        }
    });
}

fn shutdown_polish(app_handle: &AppHandle) {
    let manager = app_handle.state::<Arc<PolishManager>>();
    if let Err(error) = tauri::async_runtime::block_on(manager.shutdown()) {
        log::error!("Failed to stop local Polish runtime before termination: {error:#}");
    }
}

fn exit_without_destructors(exit_code: i32) -> ! {
    // Signal-thread exit must skip global destructors while inference runtimes remain live.
    unsafe { libc::_exit(exit_code) }
}

fn run_termination<ExitOutput>(
    exit_code: i32,
    cleanup: impl FnOnce(),
    exit_process: impl FnOnce(i32) -> ExitOutput,
) {
    cleanup();
    let _ = exit_process(exit_code);
}

fn toggle_transcription(app_handle: &AppHandle) {
    let binding_id = "transcribe";
    let shortcut_string = "SIGUSR2";
    let Some(action) = ACTION_MAP.get(binding_id) else {
        warn!("No action defined in ACTION_MAP for binding ID '{binding_id}'");
        return;
    };
    let toggle_state_manager = app_handle.state::<ManagedToggleState>();
    let mut states = match toggle_state_manager.lock() {
        Ok(states) => states,
        Err(error) => {
            warn!("Failed to lock toggle state manager: {error}");
            return;
        }
    };
    let is_active = states
        .active_toggles
        .entry(binding_id.to_string())
        .or_insert(false);
    if *is_active {
        debug!("SIGUSR2: Stopping transcription");
        action.stop(app_handle, binding_id, shortcut_string);
        *is_active = false;
        return;
    }
    debug!("SIGUSR2: Starting transcription");
    action.start(app_handle, binding_id, shortcut_string);
    *is_active = true;
    info!("SIGUSR2: Transcription started");
}

#[cfg(test)]
mod tests {
    use super::{exit_without_destructors, signal_action, SignalAction};
    use signal_hook::consts::{SIGINT, SIGTERM, SIGUSR2};
    use std::cell::RefCell;
    use std::env;
    use std::fs;
    use std::process::Command;
    use std::rc::Rc;

    const EXIT_MARKER_ENV: &str = "ECHO_SIGNAL_EXIT_MARKER";
    const STANDARD_EXIT_ENV: &str = "ECHO_USE_STANDARD_PROCESS_EXIT";

    extern "C" fn mark_process_destructor() {
        let Some(path) = env::var_os(EXIT_MARKER_ENV) else {
            return;
        };
        let _ = fs::write(path, "process destructor ran");
    }

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

    #[test]
    fn signal_exit_skips_process_destructors() {
        let temp_dir = tempfile::tempdir().expect("temp directory should be available");
        let test_executable = env::current_exe().expect("test executable should be available");
        let standard_marker = temp_dir.path().join("standard-exit-destructor");
        let standard_status = Command::new(&test_executable)
            .args(["--exact", "signal_handle::tests::signal_exit_child_process"])
            .env(EXIT_MARKER_ENV, &standard_marker)
            .env(STANDARD_EXIT_ENV, "1")
            .status()
            .expect("standard exit child should start");
        let immediate_marker = temp_dir.path().join("immediate-exit-destructor");
        let immediate_status = Command::new(test_executable)
            .args(["--exact", "signal_handle::tests::signal_exit_child_process"])
            .env(EXIT_MARKER_ENV, &immediate_marker)
            .status()
            .expect("immediate exit child should start");

        assert_eq!(standard_status.code(), Some(73));
        assert!(standard_marker.exists());
        assert_eq!(immediate_status.code(), Some(73));
        assert!(!immediate_marker.exists());
    }

    #[test]
    fn signal_exit_child_process() {
        if env::var_os(EXIT_MARKER_ENV).is_none() {
            return;
        }
        unsafe { libc::atexit(mark_process_destructor) };
        if env::var_os(STANDARD_EXIT_ENV).is_some() {
            std::process::exit(73);
        }
        exit_without_destructors(73);
    }
}
