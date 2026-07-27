use log::LevelFilter;

#[allow(dead_code)]
pub fn init() {
    // tauri-plugin-log inits through the Tauri builder
}

pub fn set_debug_logging(enabled: bool) {
    let level = if enabled {
        LevelFilter::Debug
    } else {
        LevelFilter::Info
    };

    log::set_max_level(level);
}
