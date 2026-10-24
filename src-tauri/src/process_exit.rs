//! Quit via `_exit`: ggml's Metal static dtor aborts while model buffers are live.

use tauri::{AppHandle, RunEvent};

/// Cmd+Q, tray and updater all reach the final `Exit`.
#[derive(Default)]
pub(crate) struct ExitFlow {
    requested_code: Option<i32>,
}

impl ExitFlow {
    pub(crate) fn on_run_event(&mut self, app: &AppHandle, event: &RunEvent) {
        match event {
            RunEvent::ExitRequested { code, .. } => self.requested_code = *code,
            RunEvent::Exit => {
                crate::features::polish::app_exit::shutdown(app);
                end_process(app, self.requested_code);
            }
            _ => {}
        }
    }
}

/// Replaces Tauri's post-`Exit` cleanup, relaunch and `exit`.
#[cfg(unix)]
fn end_process(app: &AppHandle, requested_code: Option<i32>) -> ! {
    app.cleanup_before_exit();
    let plan = exit_plan(requested_code);
    if plan.relaunch {
        relaunch(app);
    }
    exit_without_destructors(plan.code)
}

/// Windows exits through Tauri: its Vulkan backend has no residency-set teardown to trip.
#[cfg(not(unix))]
fn end_process(_app: &AppHandle, _requested_code: Option<i32>) {}

#[cfg(unix)]
#[derive(Debug, PartialEq, Eq)]
struct ExitPlan {
    relaunch: bool,
    code: i32,
}

#[cfg(unix)]
fn exit_plan(requested_code: Option<i32>) -> ExitPlan {
    match requested_code {
        Some(tauri::RESTART_EXIT_CODE) => ExitPlan {
            relaunch: true,
            code: 0,
        },
        code => ExitPlan {
            relaunch: false,
            code: code.unwrap_or(0),
        },
    }
}

/// Tauri's restart minus its `exit`; `mainBinaryName` keeps the binary path across updates.
#[cfg(unix)]
fn relaunch(app: &AppHandle) {
    use tauri::Manager;

    let env = app.env();
    let spawned = tauri::process::current_binary(&env).and_then(|binary| {
        std::process::Command::new(binary)
            .args(env.args_os.iter().skip(1))
            .spawn()
    });
    if let Err(error) = spawned {
        log::error!("Failed to relaunch Echo after the update: {error}");
    }
}

#[cfg(unix)]
pub(crate) fn exit_without_destructors(exit_code: i32) -> ! {
    log::logger().flush();
    unsafe { libc::_exit(exit_code) }
}

#[cfg(all(test, unix))]
mod tests {
    use super::{exit_plan, exit_without_destructors, ExitPlan};
    use std::env;
    use std::fs;
    use std::process::Command;

    const EXIT_MARKER_ENV: &str = "ECHO_EXIT_DESTRUCTOR_MARKER";
    const STANDARD_EXIT_ENV: &str = "ECHO_USE_STANDARD_PROCESS_EXIT";

    extern "C" fn mark_process_destructor() {
        let Some(path) = env::var_os(EXIT_MARKER_ENV) else {
            return;
        };
        let _ = fs::write(path, "process destructor ran");
    }

    #[test]
    fn only_a_restart_request_relaunches_and_it_exits_cleanly() {
        assert_eq!(
            exit_plan(Some(tauri::RESTART_EXIT_CODE)),
            ExitPlan {
                relaunch: true,
                code: 0
            }
        );
        assert_eq!(
            exit_plan(Some(3)),
            ExitPlan {
                relaunch: false,
                code: 3
            }
        );
        assert_eq!(
            exit_plan(None),
            ExitPlan {
                relaunch: false,
                code: 0
            }
        );
    }

    #[test]
    fn exit_skips_process_destructors() {
        let temp_dir = tempfile::tempdir().expect("temp directory should be available");
        let test_executable = env::current_exe().expect("test executable should be available");
        let standard_marker = temp_dir.path().join("standard-exit-destructor");
        let standard_status = Command::new(&test_executable)
            .args(["--exact", "process_exit::tests::exit_child_process"])
            .env(EXIT_MARKER_ENV, &standard_marker)
            .env(STANDARD_EXIT_ENV, "1")
            .status()
            .expect("standard exit child should start");
        let immediate_marker = temp_dir.path().join("immediate-exit-destructor");
        let immediate_status = Command::new(test_executable)
            .args(["--exact", "process_exit::tests::exit_child_process"])
            .env(EXIT_MARKER_ENV, &immediate_marker)
            .status()
            .expect("immediate exit child should start");

        assert_eq!(standard_status.code(), Some(73));
        assert!(standard_marker.exists());
        assert_eq!(immediate_status.code(), Some(73));
        assert!(!immediate_marker.exists());
    }

    #[test]
    fn exit_child_process() {
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
