fn main() {
    // screencapturekit loads @rpath/libswift_Concurrency.dylib from the OS Swift runtime.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rerun-if-env-changed=VULKAN_SDK");
        if let Ok(vulkan_sdk) = std::env::var("VULKAN_SDK") {
            // transcribe-cpp-sys links vulkan-1 by name without adding the SDK's library dir.
            println!("cargo:rustc-link-search=native={vulkan_sdk}/Lib");
        }
    }

    tauri_build::build()
}
