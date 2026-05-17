fn main() {
    // screencapturekit (macOS) links against Swift's _Concurrency runtime via
    // @rpath/libswift_Concurrency.dylib. The dylib lives in the OS-shipped
    // Swift runtime under /usr/lib/swift on macOS 12+, so we add that directory
    // to the binary's runtime search path. dyld resolves it via the shared
    // cache even though the file isn't physically on disk on recent macOS.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }

    tauri_build::build()
}
