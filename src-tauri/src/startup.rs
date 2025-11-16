use std::sync::Mutex;
#[cfg(target_os = "macos")]
use std::time::Duration;
#[cfg(target_os = "macos")]
use tokio::time;
#[cfg(target_os = "macos")]
// 200ms balances UI responsiveness with allowing the splash screen to fully close
// before resetting window elevation. Adjust with caution.
const MACOS_WINDOW_FOREGROUND_DELAY_MS: u64 = 200;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct StartupState {
    frontend_ready: bool,
    backend_ready: bool,
    start_hidden: bool,
    finished: bool,
}

pub type ManagedStartupState = Mutex<StartupState>;

pub fn show_main_window(app: &AppHandle) {
    if let Some(main_window) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
                eprintln!("Failed to set activation policy to Regular: {}", e);
            }
            // Temporarily keep the window on top to fight macOS z-order jumps
            if let Err(e) = main_window.set_always_on_top(true) {
                eprintln!("Failed to elevate window temporarily: {}", e);
            }
        }

        if let Err(e) = main_window.show() {
            eprintln!("Failed to show window: {}", e);
        }

        if let Err(e) = main_window.set_focus() {
            eprintln!("Failed to focus window: {}", e);
        }

        #[cfg(target_os = "macos")]
        {
            let app_handle = app.clone();
            let window_label = main_window.label().to_string();
            tauri::async_runtime::spawn(async move {
                // Delay ensures the splash window finishes closing before we drop elevation
                time::sleep(Duration::from_millis(MACOS_WINDOW_FOREGROUND_DELAY_MS)).await;
                if let Some(window) = app_handle.get_webview_window(&window_label) {
                    if let Err(e) = window.set_always_on_top(false) {
                        eprintln!("Failed to reset always_on_top: {}", e);
                    }
                    if let Err(e) = window.set_focus() {
                        eprintln!("Failed to refocus window after elevation reset: {}", e);
                    }
                }
            });
        }
    } else {
        eprintln!("Main window not found.");
    }
}

fn finish_startup_if_ready(app: &AppHandle, state: &mut StartupState) {
    if state.frontend_ready && state.backend_ready && !state.finished {
        state.finished = true;

        if let Some(splash_window) = app.get_webview_window("startup-loading-screen") {
            let _ = splash_window.close();
        }

        if !state.start_hidden {
            show_main_window(app);
        }
    }
}

pub fn mark_backend_ready(app: &AppHandle) {
    if let Some(startup_state) = app.try_state::<ManagedStartupState>() {
        if let Ok(mut guard) = startup_state.lock() {
            guard.backend_ready = true;
            finish_startup_if_ready(app, &mut guard);
        }
    }
}

pub fn set_start_hidden(app: &AppHandle, start_hidden: bool) {
    if let Ok(mut startup_state) = app.state::<ManagedStartupState>().lock() {
        startup_state.start_hidden = start_hidden;
    }
}

#[tauri::command]
pub fn mark_frontend_ready(
    app: AppHandle,
    state: State<'_, ManagedStartupState>,
) -> Result<(), String> {
    let mut startup_state = state
        .lock()
        .map_err(|_| "Failed to lock startup state".to_string())?;
    if startup_state.frontend_ready {
        return Ok(());
    }
    startup_state.frontend_ready = true;
    finish_startup_if_ready(&app, &mut startup_state);
    Ok(())
}
