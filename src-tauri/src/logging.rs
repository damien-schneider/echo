use log::LevelFilter;

pub fn set_debug_logging(enabled: bool) {
    let level = if enabled {
        LevelFilter::Debug
    } else {
        LevelFilter::Info
    };

    log::set_max_level(level);
}
