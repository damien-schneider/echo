use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Mutex, Once, OnceLock};
use std::thread;
use std::time::Duration;

use rdev::{listen, Event};

const RETRY_DELAY: Duration = Duration::from_secs(1);

static SUBSCRIBERS: OnceLock<Mutex<Vec<Sender<Event>>>> = OnceLock::new();
static LISTENER: Once = Once::new();

/// rdev holds a single global callback, so the process opens one listener and every feature reads from it.
pub fn subscribe() -> Receiver<Event> {
    let (sender, receiver) = channel();
    if let Ok(mut subscribers) = subscribers().lock() {
        subscribers.push(sender);
    }
    LISTENER.call_once(|| {
        thread::spawn(listen_until_stopped);
    });
    receiver
}

fn subscribers() -> &'static Mutex<Vec<Sender<Event>>> {
    SUBSCRIBERS.get_or_init(|| Mutex::new(Vec::new()))
}

fn listen_until_stopped() {
    loop {
        log::info!("[InputEvents] Starting rdev::listen...");
        if let Err(error) = listen(fan_out) {
            log::error!("[InputEvents] rdev::listen failed: {error:?}");
        }
        thread::sleep(RETRY_DELAY);
    }
}

fn fan_out(event: Event) {
    let Ok(mut subscribers) = subscribers().lock() else {
        return;
    };
    subscribers.retain(|subscriber| subscriber.send(event.clone()).is_ok());
}
