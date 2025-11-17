use std::sync::Once;

use env_logger::Env;
use log::LevelFilter;

static LOGGER_INIT: Once = Once::new();

pub fn init() {
    LOGGER_INIT.call_once(|| {
        env_logger::Builder::from_env(
            Env::default().default_filter_or("info"),
        )
        .format_timestamp_secs()
        .init();
    });
}

pub fn set_debug_logging(enabled: bool) {
    let level = if enabled {
        LevelFilter::Debug
    } else {
        LevelFilter::Info
    };

    log::set_max_level(level);
}
