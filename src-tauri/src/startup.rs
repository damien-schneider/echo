use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct StartupState {
    frontend_ready: bool,
    backend_ready: bool,
    start_hidden: bool,
    finished: bool,
}

pub type ManagedStartupState = Mutex<StartupState>;

fn show_main_window(app: &AppHandle) {
    if let Some(main_window) = app.get_webview_window("main") {
        // First, ensure the window is visible
        if let Err(e) = main_window.show() {
            eprintln!("Failed to show window: {}", e);
        }
        // Then, bring it to the front and give it focus
        if let Err(e) = main_window.set_focus() {
            eprintln!("Failed to focus window: {}", e);
        }
        // Optional: On macOS, ensure the app becomes active if it was an accessory
        #[cfg(target_os = "macos")]
        {
            if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
                eprintln!("Failed to set activation policy to Regular: {}", e);
            }
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
    if let Ok(mut startup_state) = app
        .state::<ManagedStartupState>()
        .lock()
    {
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
