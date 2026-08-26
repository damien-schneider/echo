#[cfg(target_os = "macos")]
#[path = "listener/macos.rs"]
mod platform;

#[cfg(not(target_os = "macos"))]
#[path = "listener/fallback.rs"]
mod platform;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::sync_channel;
use std::sync::mpsc::SyncSender;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use tauri::AppHandle;

use super::double_shift::{DoubleShiftDetector, ShortcutProgress, DOUBLE_SHIFT_INTERVAL};

/// A listener refused for want of Accessibility must come back once the user grants it.
const RETRY_DELAY: Duration = Duration::from_secs(1);

pub(super) enum InputSignal {
    ShiftDown,
    ShiftUp,
    Interruption,
}

pub(super) fn listen_for_double_shift(app: AppHandle, enabled: Arc<AtomicBool>) {
    let (sender, receiver) = sync_channel(1);

    thread::spawn(move || {
        while receiver.recv().is_ok() {
            super::save_selection(&app);
        }
    });

    thread::spawn(move || watch_for_double_shift(sender, enabled));
}

fn watch_for_double_shift(sender: SyncSender<()>, enabled: Arc<AtomicBool>) {
    let mut granted = None;

    loop {
        if !platform::access_granted() {
            if granted != Some(false) {
                log::info!("[Capture] waiting for Accessibility access before listening for Shift");
                granted = Some(false);
            }
            thread::sleep(RETRY_DELAY);
            continue;
        }
        if granted != Some(true) {
            log::info!("[Capture] listening for a double Shift tap");
            granted = Some(true);
        }

        if let Err(error) = platform::listen(taps(sender.clone(), enabled.clone())) {
            log::error!("[Capture] double-shift listener stopped: {error}");
        }
        thread::sleep(RETRY_DELAY);
    }
}

fn taps(sender: SyncSender<()>, enabled: Arc<AtomicBool>) -> impl FnMut(InputSignal) {
    let mut detector = DoubleShiftDetector::new(DOUBLE_SHIFT_INTERVAL);
    move |signal| {
        if !enabled.load(Ordering::SeqCst) {
            detector.cancel();
            return;
        }
        let progress = match signal {
            InputSignal::ShiftDown => detector.update_shift(true, Instant::now()),
            InputSignal::ShiftUp => detector.update_shift(false, Instant::now()),
            InputSignal::Interruption => {
                detector.cancel();
                None
            }
        };
        if progress == Some(ShortcutProgress::Complete) {
            log::info!("[Capture] double Shift detected");
            let _ = sender.try_send(());
        }
    }
}
