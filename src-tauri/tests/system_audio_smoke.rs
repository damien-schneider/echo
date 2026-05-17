//! Smoke coverage for system audio capture per platform.
//!
//! These tests exercise the trait construction + cfg gating without actually
//! starting a real capture (which would require Screen Recording permission
//! on macOS, an active output device, etc.). Real-capture verification lives
//! in the manual smoke checklist.

use echo_app_lib::audio_toolkit::audio::system_capture::{
    create_system_capture, is_system_audio_available,
};

#[test]
fn is_available_returns_true_on_supported_platforms() {
    if cfg!(any(target_os = "macos", target_os = "windows", target_os = "linux")) {
        assert!(
            is_system_audio_available(),
            "system audio should be advertised as available on this OS"
        );
    } else {
        assert!(
            !is_system_audio_available(),
            "system audio should NOT be advertised on unsupported OSes"
        );
    }
}

#[test]
fn create_system_capture_constructs_handle() {
    if !cfg!(any(target_os = "macos", target_os = "windows", target_os = "linux")) {
        // The factory is supposed to error on unsupported targets.
        assert!(create_system_capture().is_err());
        return;
    }
    let result = create_system_capture();
    assert!(
        result.is_ok(),
        "create_system_capture should return Ok on supported OS, got {:?}",
        result.err().map(|e| e.to_string())
    );
}
