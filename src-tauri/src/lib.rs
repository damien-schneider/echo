#![allow(unexpected_cfgs)] // objc 0.2.x macros emit spurious cargo-clippy cfg checks.

pub mod actions;
mod audio_feedback;
pub mod audio_toolkit;
mod clipboard;
pub mod commands;
mod dictation;
mod features;
mod helpers;
mod logging;
#[cfg(target_os = "macos")]
mod macos_accessibility;
#[cfg(target_os = "macos")]
mod macos_pasteboard;
pub mod managers;
mod overlay;
pub mod settings;
#[cfg(unix)]
mod signal_handle;
mod startup;
mod startup_guards;
mod tray;
mod updates;
mod utils;
mod wayland;

use features::shortcut;

use env_filter::Builder as EnvFilterBuilder;
use features::capture::CaptureStore;
use features::polish::manager::PolishManager;
use managers::audio::AudioRecordingManager;
use managers::diarization::DiarizationManager;
use managers::history::HistoryManager;
use managers::input_tracker::InputTrackerManager;
use managers::meeting::MeetingManager;
use managers::model::ModelManager;
use managers::transcription::TranscriptionManager;
use managers::tts::TtsManager;
use startup::show_main_window;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::image::Image;

use anyhow::Context;
#[cfg(unix)]
use signal_hook::consts::{SIGINT, SIGTERM, SIGUSR2};
#[cfg(unix)]
use signal_hook::iterator::Signals;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_log::{Builder as LogBuilder, LogLevel, RotationStrategy, Target, TargetKind};

#[derive(Default)]
struct ShortcutToggleStates {
    active_toggles: HashMap<String, bool>,
}

type ManagedToggleState = Mutex<ShortcutToggleStates>;

static FILE_TRANSCRIPTION_ACTIVE: AtomicBool = AtomicBool::new(false);

pub fn is_file_transcription_active() -> bool {
    FILE_TRANSCRIPTION_ACTIVE.load(Ordering::SeqCst)
}

pub fn set_file_transcription_active(active: bool) {
    FILE_TRANSCRIPTION_ACTIVE.store(active, Ordering::SeqCst);
}

fn initialize_core_logic(app_handle: &AppHandle) -> anyhow::Result<()> {
    let recording_manager =
        Arc::new(AudioRecordingManager::new(app_handle).context("the audio recorder")?);
    let model_manager = Arc::new(ModelManager::new(app_handle).context("model storage")?);
    let polish_manager = Arc::new(PolishManager::new(app_handle, model_manager.clone()));
    let transcription_manager = Arc::new(
        TranscriptionManager::new(app_handle, model_manager.clone())
            .context("the transcription engine")?,
    );

    let history_manager =
        Arc::new(HistoryManager::new(app_handle).context("the history database")?);

    let capture_store = Arc::new(CaptureStore::new(app_handle).context("the capture store")?);

    let input_tracker_manager = Arc::new(Mutex::new(
        InputTrackerManager::new(app_handle).context("input tracking")?,
    ));

    let tts_manager = Arc::new(TtsManager::new());

    if let Err(e) = tts_manager.initialize() {
        log::warn!("Failed to initialize TTS engine on startup: {}", e);
    }

    let meeting_manager = Arc::new(MeetingManager::new(app_handle).context("meeting recording")?);

    let diarization_manager = Arc::new(
        DiarizationManager::new(app_handle, model_manager.clone())
            .context("speaker diarization")?,
    );

    // Keep the selected local model resident so first dictation is responsive.
    {
        let model_size = settings::get_settings(app_handle).transcription_model_size;
        let realtime_model_id = managers::model::transcription_profile_id(model_size).to_string();
        let is_downloaded = model_manager
            .get_model_info(&realtime_model_id)
            .map(|model| model.is_downloaded)
            .unwrap_or(false);
        if !realtime_model_id.is_empty() && is_downloaded {
            let tm = transcription_manager.clone();
            let app_for_model = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let selected_size = settings::get_settings(&app_for_model).transcription_model_size;
                let selected_model_id = managers::model::transcription_profile_id(selected_size);
                if selected_model_id != realtime_model_id {
                    log::info!(
                        "Skipping stale model load for '{}'; '{}' is now selected",
                        realtime_model_id,
                        selected_model_id
                    );
                    return;
                }
                match tm.load_streaming_model(&realtime_model_id) {
                    Ok(()) => {
                        log::info!(
                            "Realtime model '{}' resident for live preview",
                            realtime_model_id
                        );
                        // cold first decode runs for seconds — pre-compile the Metal/CoreML kernels off-thread
                        let tm_warm = tm.clone();
                        std::thread::spawn(move || {
                            let warm_start = std::time::Instant::now();
                            match tm_warm.transcribe_for_streaming(
                                crate::managers::transcription::build_warmup_audio(),
                            ) {
                                Ok(_) => log::debug!(
                                    "Streaming engine warmup decode completed in {}ms",
                                    warm_start.elapsed().as_millis()
                                ),
                                Err(e) => {
                                    log::debug!("Streaming engine warmup decode skipped: {e:#}")
                                }
                            }
                        });
                    }
                    Err(e) => log::warn!(
                        "Realtime model '{}' could not be loaded: {}",
                        realtime_model_id,
                        e
                    ),
                }
            });
        } else if !realtime_model_id.is_empty() {
            log::info!(
                "Transcription model '{}' is not installed; waiting for user download",
                realtime_model_id
            );
        }
    }

    // pinned by a never-released keepalive so the idle watcher can't evict it cold between dictations
    let selected_model_id = managers::model::transcription_profile_id(
        settings::get_settings(app_handle).transcription_model_size,
    );
    let should_prewarm = model_manager
        .get_model_info(selected_model_id)
        .map(|model| model.is_downloaded)
        .unwrap_or(false);
    if should_prewarm {
        let tm = transcription_manager.clone();
        std::thread::spawn(move || {
            if let Err(e) = tm.prewarm() {
                log::warn!("Boot prewarm of main engine failed: {e:#}");
                return;
            }
            // pin before the decode — `Immediately`-unload would drop the model the instant it returns
            match tm.warmup_decode_dummy() {
                Ok(()) => log::info!(
                    "Main transcription engine prewarmed + pinned resident for fast dictation"
                ),
                Err(e) => log::debug!("Boot warmup decode skipped: {e:#}"),
            }
        });
    }

    app_handle.manage(recording_manager.clone());
    app_handle.manage(model_manager.clone());
    app_handle.manage(polish_manager.clone());
    app_handle.manage(transcription_manager.clone());
    app_handle.manage(history_manager.clone());
    app_handle.manage(capture_store);
    app_handle.manage(input_tracker_manager.clone());
    app_handle.manage(tts_manager.clone());
    app_handle.manage(meeting_manager.clone());
    app_handle.manage(diarization_manager.clone());

    features::polish::idle_release::watch_idle_runtime(&polish_manager);

    app_handle.manage(commands::cleanup::new_state());
    app_handle.manage(shortcut::failures::ShortcutFailures::default());

    {
        let settings = settings::get_settings(app_handle);
        if settings.input_tracking_enabled {
            if let Ok(mut tracker) = input_tracker_manager.lock() {
                if let Err(e) = tracker.start(app_handle.clone()) {
                    log::error!("Failed to start input tracker: {}", e);
                }
            }
        }
    }

    // Must run before init_shortcuts.
    #[cfg(target_os = "linux")]
    {
        shortcut::init_wayland_state(app_handle);
    }

    shortcut::init_shortcuts(app_handle);
    features::capture::start(app_handle);

    #[cfg(unix)]
    {
        if let Ok(signals) = Signals::new(&[SIGUSR2, SIGINT, SIGTERM]) {
            signal_handle::setup_signal_handler(app_handle.clone(), signals);
        } else {
            log::warn!("Failed to register Unix signal handler");
        }
    }

    #[cfg(target_os = "macos")]
    {
        let settings = settings::get_settings(app_handle);
        if settings.start_hidden {
            let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
    }
    let initial_theme = tray::get_current_theme(app_handle);

    let initial_icon_path = tray::get_icon_path(initial_theme, tray::TrayIconState::Idle);

    let tray_builder = TrayIconBuilder::new()
        .icon(
            Image::from_path(
                app_handle
                    .path()
                    .resolve(initial_icon_path, tauri::path::BaseDirectory::Resource)
                    .context("the tray icon")?,
            )
            .context("the tray icon")?,
        )
        .show_menu_on_left_click(true)
        .icon_as_template(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                show_main_window(app);
            }
            "check_updates" => {
                show_main_window(app);
                updates::check_in_background(app);
            }
            "cancel" => {
                use crate::utils::cancel_current_operation;

                cancel_current_operation(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        });

    // Tray icons are identical, so a dev build labels itself next to an installed Echo.
    #[cfg(debug_assertions)]
    let tray_builder = tray_builder.title("DEV").tooltip("Echo Dev");

    let tray = tray_builder.build(app_handle).context("the tray icon")?;
    app_handle.manage(tray);

    utils::update_tray_menu(app_handle, &utils::TrayIconState::Idle);

    let autostart_manager = app_handle.autolaunch();
    let settings = settings::get_settings(&app_handle);

    if settings.autostart_enabled {
        let _ = autostart_manager.enable();
    } else {
        let _ = autostart_manager.disable();
    }

    utils::create_recording_overlay(app_handle);
    updates::watch(app_handle);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub static FILE_LOG_LEVEL: AtomicU8 = AtomicU8::new(log::LevelFilter::Debug as u8);

fn level_filter_from_u8(value: u8) -> log::LevelFilter {
    match value {
        0 => log::LevelFilter::Off,
        1 => log::LevelFilter::Error,
        2 => log::LevelFilter::Warn,
        3 => log::LevelFilter::Info,
        4 => log::LevelFilter::Debug,
        5 => log::LevelFilter::Trace,
        _ => log::LevelFilter::Trace,
    }
}

fn build_console_filter() -> env_filter::Filter {
    let mut builder = EnvFilterBuilder::new();

    match std::env::var("RUST_LOG") {
        Ok(spec) if !spec.trim().is_empty() => {
            if let Err(err) = builder.try_parse(&spec) {
                log::warn!(
                    "Ignoring invalid RUST_LOG value '{}': {}. Falling back to info-level console logging",
                    spec,
                    err
                );
                builder.filter_level(log::LevelFilter::Info);
            }
        }
        _ => {
            builder.filter_level(log::LevelFilter::Info);
        }
    }

    builder.build()
}

/// Window drops — no window shown, only error dialog.
async fn validate_and_transcribe_file(app: AppHandle, file_path: PathBuf) -> Result<(), String> {
    if !file_path.exists() {
        let error_payload = serde_json::json!({
            "title": "File Not Found",
            "message": "The selected file could not be found.",
            "details": format!("Path: {}", file_path.display())
        });
        let _ = app.emit("show-error-dialog", error_payload);
        return Err("File not found".to_string());
    }

    let valid_extensions = [
        "wav", "wave", "mp3", "m4a", "aac", "ogg", "oga", "mp4", "mov", "avi", "mkv", "webm", "flv",
    ];
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if !valid_extensions.contains(&extension.as_str()) {
        let error_payload = serde_json::json!({
            "title": "Unsupported File Format",
            "message": format!("The file format '.{}' is not supported.", extension),
            "details": "Supported formats: Audio (wav, mp3, m4a, ogg) and Video (mp4, mov, mkv, webm)"
        });
        let _ = app.emit("show-error-dialog", error_payload);
        return Err(format!("Unsupported file format: .{}", extension));
    }

    let history_manager = app.state::<Arc<HistoryManager>>();
    let transcription_manager = app.state::<Arc<TranscriptionManager>>();

    let file_path_str = file_path.to_string_lossy().to_string();
    commands::file_transcription::transcribe_audio_file(
        app.clone(),
        file_path_str,
        history_manager,
        transcription_manager,
    )
    .await?;

    Ok(())
}

/// Icon drops — shows window after completion.
async fn validate_and_transcribe_file_icon_drop(
    app: AppHandle,
    file_path: PathBuf,
    show_window_after: bool,
) -> Result<(), String> {
    if !file_path.exists() {
        let error_payload = serde_json::json!({
            "title": "File Not Found",
            "message": "The selected file could not be found.",
            "details": format!("Path: {}", file_path.display())
        });
        let _ = app.emit("show-error-dialog", error_payload);
        startup::show_main_window(&app);
        return Err("File not found".to_string());
    }

    let valid_extensions = [
        "wav", "wave", "mp3", "m4a", "aac", "ogg", "oga", "mp4", "mov", "avi", "mkv", "webm", "flv",
    ];
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    if !valid_extensions.contains(&extension.as_str()) {
        let error_payload = serde_json::json!({
            "title": "Unsupported File Format",
            "message": format!("The file format '.{}' is not supported.", extension),
            "details": "Supported formats: Audio (wav, mp3, m4a, ogg) and Video (mp4, mov, mkv, webm)"
        });
        let _ = app.emit("show-error-dialog", error_payload);
        startup::show_main_window(&app);
        return Err(format!("Unsupported file format: .{}", extension));
    }

    let history_manager = app.state::<Arc<HistoryManager>>();
    let transcription_manager = app.state::<Arc<TranscriptionManager>>();

    let file_path_str = file_path.to_string_lossy().to_string();
    commands::file_transcription::transcribe_audio_file(
        app.clone(),
        file_path_str,
        history_manager,
        transcription_manager,
    )
    .await?;

    if show_window_after {
        startup::show_main_window(&app);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn with_overlay_panel_plugin(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.plugin(tauri_nspanel::init())
}

#[cfg(not(target_os = "macos"))]
fn with_overlay_panel_plugin(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder
}

pub fn run() {
    let app = with_overlay_panel_plugin(tauri::Builder::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Icon drops via args.
            let file_paths: Vec<PathBuf> = args
                .iter()
                .skip(1)
                .filter_map(|arg| {
                    let path = PathBuf::from(arg);
                    if path.exists() {
                        Some(path)
                    } else {
                        None
                    }
                })
                .collect();

            if !file_paths.is_empty() {
                log::info!("Files dropped on app icon: {:?}", file_paths);

                if let Some(file_path) = file_paths.first() {
                    let app_handle = app.clone();
                    let path = file_path.clone();

                    tauri::async_runtime::spawn(async move {
                        let handle_for_emit = app_handle.clone();
                        if let Err(e) =
                            validate_and_transcribe_file_icon_drop(app_handle, path, true).await
                        {
                            log::error!("Failed to transcribe dropped file: {}", e);
                            let _ = handle_for_emit.emit("file-transcription-error", e);
                        }
                    });
                }
            } else {
                show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(
            LogBuilder::new()
                .level(log::LevelFilter::Trace)
                .max_file_size(500_000)
                .rotation_strategy(RotationStrategy::KeepOne)
                .clear_targets()
                .targets([
                    // Console respects RUST_LOG.
                    Target::new(TargetKind::Stdout).filter({
                        let console_filter = build_console_filter();
                        move |metadata| console_filter.enabled(metadata)
                    }),
                    // File logs follow FILE_LOG_LEVEL from settings.
                    Target::new(TargetKind::LogDir {
                        file_name: Some("handy".into()),
                    })
                    .filter(|metadata| {
                        let file_level = FILE_LOG_LEVEL.load(Ordering::Relaxed);
                        metadata.level() <= level_filter_from_u8(file_level)
                    }),
                ])
                .build(),
        )
        .manage(Mutex::new(ShortcutToggleStates::default()))
        .manage(Mutex::new(startup::StartupState::default()))
        .manage(updates::manager())
        .setup(move |app| {
            startup_guards::log_panics();
            #[cfg(debug_assertions)]
            startup_guards::assert_dev_data_is_isolated(&app.config().identifier);

            let settings = settings::get_settings(&app.handle());
            logging::set_debug_logging(settings.debug_logging_enabled);
            let file_log_level: log::LevelFilter = match settings.log_level {
                LogLevel::Error => log::LevelFilter::Error,
                LogLevel::Warn => log::LevelFilter::Warn,
                LogLevel::Info => log::LevelFilter::Info,
                LogLevel::Debug => log::LevelFilter::Debug,
                LogLevel::Trace => log::LevelFilter::Trace,
            };
            FILE_LOG_LEVEL.store(file_log_level as u8, Ordering::Relaxed);
            let app_handle = app.handle().clone();

            startup::set_start_hidden(&app_handle, settings.start_hidden);
            startup::arm_startup_watchdog(&app_handle);

            if let Err(error) = initialize_core_logic(&app_handle) {
                startup_guards::report_unstartable(&error);
            }

            if let Some(main_window) = app_handle.get_webview_window("main") {
                #[cfg(debug_assertions)]
                let _ = main_window.set_title("Echo Dev");

                // tauri.conf.json ships decorations:false to dodge GTK CSD artifacts; macOS/Windows re-enable here

                #[cfg(target_os = "macos")]
                #[allow(deprecated)] // cocoa deprecated for objc2-app-kit.
                {
                    use cocoa::appkit::{NSWindow, NSWindowStyleMask, NSWindowTitleVisibility};
                    use cocoa::base::{id, YES};

                    // one atomic setStyleMask_ — traffic lights land inside the glass
                    if let Ok(ns_win) = main_window.ns_window() {
                        unsafe {
                            let window = ns_win as id;
                            window.setStyleMask_(
                                NSWindowStyleMask::NSTitledWindowMask
                                    | NSWindowStyleMask::NSClosableWindowMask
                                    | NSWindowStyleMask::NSMiniaturizableWindowMask
                                    | NSWindowStyleMask::NSResizableWindowMask
                                    | NSWindowStyleMask::NSFullSizeContentViewWindowMask,
                            );
                            window.setTitlebarAppearsTransparent_(YES);
                            window
                                .setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden);
                        }
                    }
                }

                #[cfg(target_os = "windows")]
                {
                    use tauri::TitleBarStyle;
                    let _ = main_window.set_decorations(true);
                    let _ = main_window.set_title_bar_style(TitleBarStyle::Transparent);
                }
            }

            startup::mark_backend_ready(&app_handle);

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // hide-to-tray is the main window only; splash/overlays must really close
            tauri::WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                api.prevent_close();
                let _res = window.hide();
                #[cfg(target_os = "macos")]
                {
                    let res = window
                        .app_handle()
                        .set_activation_policy(tauri::ActivationPolicy::Accessory);
                    if let Err(e) = res {
                        log::error!("Failed to set activation policy: {}", e);
                    }
                }
            }
            tauri::WindowEvent::ThemeChanged(theme) => {
                log::info!("Theme changed to: {:?}", theme);
                utils::change_tray_icon(&window.app_handle(), utils::TrayIconState::Idle);
            }
            tauri::WindowEvent::DragDrop(drag_event) => match drag_event {
                tauri::DragDropEvent::Enter { .. } => {
                    log::info!("File drag entered window");
                    let _ = window.emit("drag-enter", ());
                }
                tauri::DragDropEvent::Over { .. } => {
                    let _ = window.emit("drag-over", ());
                }
                tauri::DragDropEvent::Leave => {
                    log::info!("File drag left window");
                    let _ = window.emit("drag-leave", ());
                }
                tauri::DragDropEvent::Drop { paths, .. } => {
                    log::info!("File dropped on window: {:?}", paths);
                    if let Some(file_path) = paths.first() {
                        let app_handle = window.app_handle().clone();
                        let path = file_path.clone();

                        tauri::async_runtime::spawn(async move {
                            let handle_for_emit = app_handle.clone();
                            if let Err(e) = validate_and_transcribe_file(app_handle, path).await {
                                log::error!("Failed to transcribe dropped file: {}", e);
                                let _ = handle_for_emit.emit("file-transcription-error", e);
                            }
                        });
                    }
                }
                _ => {}
            },
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            shortcut::bindings::change_binding,
            shortcut::bindings::reset_binding,
            shortcut::bindings::suspend_binding,
            shortcut::bindings::resume_binding,
            shortcut::check_wayland_shortcut_conflict,
            shortcut::is_wayland_session,
            shortcut::get_wayland_shortcuts,
            shortcut::open_wayland_shortcut_settings,
            shortcut::failures::get_shortcut_failures,
            shortcut::overlay_keys::hold_overlay_key,
            shortcut::overlay_keys::release_overlay_key,
            shortcut::settings::audio::change_ptt_setting,
            shortcut::settings::audio::change_audio_feedback_setting,
            shortcut::settings::audio::change_audio_feedback_volume_setting,
            shortcut::settings::audio::change_sound_theme_setting,
            shortcut::settings::audio::change_mute_while_recording_setting,
            shortcut::settings::general::change_start_hidden_setting,
            shortcut::settings::general::change_autostart_setting,
            shortcut::settings::general::change_translate_to_english_setting,
            shortcut::settings::general::change_selected_language_setting,
            shortcut::settings::general::change_overlay_position_setting,
            shortcut::settings::general::change_debug_mode_setting,
            shortcut::settings::general::change_debug_logging_setting,
            shortcut::settings::general::change_word_correction_threshold_setting,
            shortcut::settings::general::change_paste_method_setting,
            shortcut::settings::general::change_clipboard_handling_setting,
            shortcut::settings::general::update_custom_words,
            shortcut::settings::post_process::change_post_process_base_url_setting,
            shortcut::settings::post_process::change_post_process_enabled_setting,
            shortcut::settings::post_process::change_post_process_api_key_setting,
            shortcut::settings::post_process::change_post_process_model_setting,
            shortcut::settings::post_process::set_post_process_provider,
            shortcut::settings::post_process::fetch_post_process_models,
            shortcut::settings::post_process::add_post_process_prompt,
            shortcut::settings::post_process::update_post_process_prompt,
            shortcut::settings::post_process::delete_post_process_prompt,
            shortcut::settings::post_process::set_post_process_selected_prompt,
            shortcut::settings::post_process::check_model_tool_support,
            shortcut::settings::post_process::change_voice_commands_enabled_setting,
            shortcut::settings::cleanup::change_cleanup_enabled_setting,
            shortcut::settings::cleanup::change_cleanup_app_context_enabled_setting,
            shortcut::settings::cleanup::update_cleanup_dictionary,
            shortcut::settings::input_tracking::change_input_tracking_setting,
            shortcut::settings::input_tracking::change_input_tracking_excluded_apps,
            shortcut::settings::input_tracking::change_input_tracking_idle_timeout,
            features::capture::get_captures,
            features::capture::delete_capture,
            features::capture::change_double_shift_capture_setting,
            updates::get_update_status,
            updates::check_for_updates,
            updates::install_update,
            startup::mark_frontend_ready,
            overlay::begin_recording_overlay_snap_preview,
            overlay::cancel_recording_overlay_snap_preview,
            overlay::get_recording_overlay_surface,
            overlay::move_recording_overlay_to_cursor_screen,
            overlay::set_recording_overlay_dock_edge,
            overlay::snap_recording_overlay_to_nearest_edge,
            overlay::set_recording_overlay_mode,
            overlay::settle_recording_overlay_mode,
            overlay::get_overlay_notification_surface,
            overlay::set_overlay_notification_mode,
            overlay::settle_overlay_notification_mode,
            overlay::get_overlay_notification_request,
            overlay::get_overlay_chat_context,
            overlay::hide_overlay_notification,
            overlay::request_overlay_notification,
            overlay::send_held_transcript_to_chat,
            overlay::open_chat_model_settings,
            overlay::warn_from_overlay,
            commands::cancel_operation,
            commands::get_app_dir_path,
            commands::open_recordings_folder,
            commands::models::get_transcription_profiles,
            commands::models::select_transcription_model_size,
            commands::models::delete_model,
            commands::models::get_transcription_model_status,
            commands::models::is_model_loading,
            commands::models::has_any_models_available,
            commands::models::has_any_models_or_downloads,
            commands::models::get_recommended_first_model,
            features::polish::manager::get_polish_status,
            features::polish::manager::chat_with_polish_model,
            features::polish::manager::stop_polish_chat,
            features::polish::manager::download_polish_model,
            features::polish::manager::repair_polish_model,
            commands::audio::update_microphone_mode,
            commands::audio::get_microphone_mode,
            commands::audio::get_available_microphones,
            commands::audio::set_selected_microphone,
            commands::audio::get_selected_microphone,
            commands::audio::set_clamshell_microphone,
            commands::audio::get_clamshell_microphone,
            commands::audio::get_available_output_devices,
            commands::audio::set_selected_output_device,
            commands::audio::get_selected_output_device,
            commands::audio::play_test_sound,
            commands::audio::check_custom_sounds,
            commands::audio::get_microphone_permission_status,
            commands::audio::open_microphone_settings,
            helpers::clamshell::is_clamshell,
            helpers::clamshell::is_laptop,
            commands::transcription::prewarm_models,
            commands::transcription::start_transcription_from_overlay,
            commands::transcription::stop_transcription_from_overlay,
            commands::transcription::run_polish_from_overlay,
            commands::transcription::start_chat_dictation,
            commands::transcription::stop_chat_dictation,
            dictation::get_held_transcript,
            dictation::take_transcript_for_chat,
            dictation::copy_held_transcript,
            commands::history::get_history_entries,
            commands::history::toggle_history_entry_saved,
            commands::history::get_audio_file_path,
            commands::history::delete_history_entry,
            commands::history::retranscribe_history_entry,
            commands::history::reprocess_history_entry,
            commands::history::get_history_entry_transcription,
            commands::history::update_history_limit,
            commands::history::update_recording_retention_period,
            commands::file_transcription::transcribe_audio_file,
            commands::input_tracking::get_input_entries,
            commands::input_tracking::delete_input_entry,
            commands::input_tracking::clear_all_input_entries,
            commands::input_tracking::get_installed_apps,
            commands::get_log_dir_path,
            commands::open_log_dir,
            commands::set_log_level,
            features::shortcut::settings::tts::change_tts_enabled_setting,
            shortcut::settings::meeting::change_meeting_system_audio_setting,
            shortcut::settings::meeting::change_meeting_system_audio_device_setting,
            shortcut::settings::meeting::change_meeting_auto_summary_setting,
            shortcut::settings::meeting::change_meeting_chunk_duration_setting,
            shortcut::settings::meeting::get_diarization_status,
            shortcut::settings::meeting::download_diarization_model,
            commands::meeting::start_meeting,
            commands::meeting::stop_meeting,
            commands::meeting::get_meeting_status,
            commands::meeting::get_meeting,
            commands::meeting::get_meeting_segments,
            commands::meeting::list_meetings,
            commands::meeting::delete_meeting,
            commands::meeting::export_meeting,
            commands::meeting::rename_meeting_speaker,
            commands::meeting::is_system_audio_available,
            commands::meeting::get_meeting_audio_path,
            commands::meeting::retranscribe_meeting,
            commands::meeting::get_meeting_transcript_for_summary,
            commands::meeting::save_meeting_summary,
            commands::tts::preview_tts,
            commands::voice_tools::execute_change_sound_theme,
            commands::voice_tools::execute_create_note,
            commands::voice_tools::execute_open_application,
            commands::voice_tools::finalize_transcription,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app_handle, event| features::polish::app_exit::handle(app_handle, &event));
}
