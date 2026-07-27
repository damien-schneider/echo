// no extra console window on Windows release — DO NOT REMOVE
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    echo_app_lib::run()
}
