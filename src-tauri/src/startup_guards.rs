use std::panic;

/// A panic on the main thread aborts before anything reaches the log file, which leaves a crash
/// loop with nothing to read but a system report.
pub(crate) fn log_panics() {
    let default_hook = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        log::error!("Echo panicked: {info}");
        default_hook(info);
    }));
}

#[cfg(debug_assertions)]
fn dev_data_is_isolated(identifier: &str) -> bool {
    identifier.ends_with("-dev")
}

/// A debug build carrying the production identifier writes into the installed app's data
/// directory, and a migration applied there is one the installed app cannot undo.
#[cfg(debug_assertions)]
pub(crate) fn assert_dev_data_is_isolated(identifier: &str) {
    assert!(
        dev_data_is_isolated(identifier),
        "Debug build running as '{identifier}', which shares the installed app's data. \
         Start it with `bun run tauri:dev`."
    );
}

#[cfg(all(test, debug_assertions))]
mod tests {
    use super::dev_data_is_isolated;

    #[test]
    fn only_the_dev_identifier_keeps_a_debug_build_off_installed_data() {
        assert!(dev_data_is_isolated("com.damien-schneider.echo-dev"));
        assert!(!dev_data_is_isolated("com.damien-schneider.echo"));
    }
}

/// A manager that cannot start leaves Echo with no window and no tray: without this the user sees
/// a dock icon blink and nothing else, and the reason lives only in a system crash report.
pub(crate) fn report_unstartable(error: &anyhow::Error) -> ! {
    log::error!("Echo cannot start: {error:#}");
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("Echo could not start")
        .set_description(format!(
            "Echo could not start {error}.\n\nReinstall the latest version from github.com/damien-schneider/echo/releases, then open Echo again."
        ))
        .show();
    std::process::exit(1);
}
