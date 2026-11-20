//! Carbon hotkeys never see Fn; handy-keys' event tap does, once Echo has Accessibility access.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use handy_keys::{Hotkey, HotkeyId, HotkeyManager, HotkeyState};
use log::{info, warn};
use tauri::{AppHandle, Manager};

use super::combo::Combo;
use super::failures::ShortcutFailures;
use super::init::{dispatch_shortcut, register_shortcut, ShortcutEvent, ShortcutInvocation};
use crate::settings;

const EVENT_POLL_INTERVAL: Duration = Duration::from_millis(10);
const ACCESS_POLL_INTERVAL: Duration = Duration::from_secs(2);
const NEEDS_ACCESSIBILITY: &str = "Fn shortcuts need Accessibility access. Allow Echo in System Settings → Privacy & Security → Accessibility and it turns on by itself.";

struct Claim {
    binding_id: String,
    combo: String,
}

struct Tap {
    manager: HotkeyManager,
    claims: HashMap<HotkeyId, Claim>,
    generation: u64,
}

impl Tap {
    fn find(&self, binding_id: &str, combo: &str) -> Option<HotkeyId> {
        self.claims
            .iter()
            .find(|(_, claim)| claim.binding_id == binding_id && claim.combo == combo)
            .map(|(id, _)| *id)
    }

    fn drain(&self) -> Vec<(String, String, ShortcutEvent)> {
        std::iter::from_fn(|| self.manager.try_recv())
            .filter_map(|event| {
                let claim = self.claims.get(&event.id)?;
                let edge = match event.state {
                    HotkeyState::Pressed => ShortcutEvent::Pressed,
                    HotkeyState::Released => ShortcutEvent::Released,
                };
                Some((claim.binding_id.clone(), claim.combo.clone(), edge))
            })
            .collect()
    }
}

/// The tap only runs while a binding holds Fn, so nobody else pays for an event tap.
#[derive(Default)]
pub struct FnHotkeys {
    tap: Mutex<Option<Tap>>,
    generations: AtomicU64,
    awaiting_access: AtomicBool,
}

impl FnHotkeys {
    fn tap(&self) -> MutexGuard<'_, Option<Tap>> {
        self.tap.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(super) fn holds(&self, binding_id: &str, combo: &Combo) -> bool {
        let combo = combo.to_string();
        self.tap()
            .as_ref()
            .is_some_and(|tap| tap.find(binding_id, &combo).is_some())
    }

    pub(super) fn claim(
        &self,
        app: &AppHandle,
        binding_id: &str,
        combo: &Combo,
    ) -> Result<(), String> {
        let hotkey = handy_hotkey(combo)?;
        if !crate::macos_accessibility::is_trusted() {
            self.retry_once_trusted(app);
            return Err(NEEDS_ACCESSIBILITY.into());
        }
        let mut guard = self.tap();
        let tap = guard.take().map_or_else(|| self.open_tap(app), Ok)?;
        let tap = guard.insert(tap);
        let id = tap
            .manager
            .register(hotkey)
            .map_err(|_| format!("Shortcut '{combo}' is already in use"))?;
        tap.claims.insert(
            id,
            Claim {
                binding_id: binding_id.to_string(),
                combo: combo.to_string(),
            },
        );
        Ok(())
    }

    pub(super) fn release(&self, binding_id: &str, combo: &Combo) -> Result<(), String> {
        let mut guard = self.tap();
        let Some(tap) = guard.as_mut() else {
            return Ok(());
        };
        let Some(id) = tap.find(binding_id, &combo.to_string()) else {
            return Ok(());
        };
        tap.manager
            .unregister(id)
            .map_err(|error| format!("Failed to unregister shortcut '{combo}': {error}"))?;
        tap.claims.remove(&id);
        if tap.claims.is_empty() {
            let idle = guard.take();
            thread::spawn(move || drop(idle));
        }
        Ok(())
    }

    fn open_tap(&self, app: &AppHandle) -> Result<Tap, String> {
        let manager = HotkeyManager::new_with_blocking()
            .map_err(|error| format!("macOS refused the Fn key listener: {error}"))?;
        let generation = self.generations.fetch_add(1, Ordering::Relaxed);
        let app = app.clone();
        thread::spawn(move || pump_events(&app, generation));
        Ok(Tap {
            manager,
            claims: HashMap::new(),
            generation,
        })
    }

    /// Startup can run before the user grants access; the bindings that failed for it come back once it is granted.
    fn retry_once_trusted(&self, app: &AppHandle) {
        if self.awaiting_access.swap(true, Ordering::AcqRel) {
            return;
        }
        let app = app.clone();
        thread::spawn(move || {
            while !crate::macos_accessibility::is_trusted() {
                thread::sleep(ACCESS_POLL_INTERVAL);
            }
            app.state::<FnHotkeys>()
                .awaiting_access
                .store(false, Ordering::Release);
            info!("[Shortcuts] Accessibility granted; turning Fn shortcuts on");
            register_bindings_refused_for_access(&app);
        });
    }
}

fn pump_events(app: &AppHandle, generation: u64) {
    loop {
        thread::sleep(EVENT_POLL_INTERVAL);
        let events = match app.state::<FnHotkeys>().tap().as_ref() {
            Some(tap) if tap.generation == generation => tap.drain(),
            _ => return,
        };
        for (binding_id, shortcut, event) in events {
            dispatch_shortcut(ShortcutInvocation {
                app,
                binding_id: &binding_id,
                shortcut: &shortcut,
                event,
            });
        }
    }
}

fn register_bindings_refused_for_access(app: &AppHandle) {
    let refused = app.state::<ShortcutFailures>().list();
    let bindings = settings::get_bindings(app);
    for failure in refused {
        let Some(binding) = bindings.get(&failure.binding_id) else {
            continue;
        };
        let still_wanted = binding.current_binding == failure.binding
            && Combo::parse(&binding.current_binding).is_ok_and(|combo| combo.holds_fn());
        if still_wanted {
            if let Err(error) = register_shortcut(app, binding.clone()) {
                warn!("[Shortcuts] Fn shortcut still refused after access was granted: {error}");
            }
        }
    }
}

fn handy_hotkey(combo: &Combo) -> Result<Hotkey, String> {
    let key = combo.key().map(handy_key_name);
    let mut tokens: Vec<&str> = combo.modifier_names().collect();
    tokens.extend(key.as_deref());
    tokens
        .join("+")
        .parse()
        .map_err(|error| format!("'{combo}' can't be used as an Fn shortcut: {error}"))
}

/// handy-keys reads "delete" as Backspace and "num1" as the digit row; Echo means forward delete and the keypad.
fn handy_key_name(key: &str) -> String {
    let keypad_digit = key
        .strip_prefix("num")
        .filter(|rest| rest.len() == 1 && rest.chars().all(|c| c.is_ascii_digit()));
    if let Some(digit) = keypad_digit {
        return format!("keypad{digit}");
    }
    match key {
        "delete" => "forwarddelete",
        "numadd" => "keypadplus",
        "numsubtract" => "keypadminus",
        "nummultiply" => "keypadmultiply",
        "numdivide" => "keypaddivide",
        "numdecimal" => "keypaddecimal",
        "numenter" => "keypadenter",
        "numequal" => "keypadequals",
        other => other,
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::{handy_hotkey, Combo, Hotkey};

    fn hotkey(raw: &str) -> Hotkey {
        handy_hotkey(&Combo::usable(raw).unwrap()).unwrap()
    }

    #[test]
    fn fn_delete_listens_for_forward_delete_not_backspace() {
        assert_eq!(hotkey("fn+delete"), "fn+forwarddelete".parse().unwrap());
        assert_eq!(hotkey("fn+backspace"), "fn+backspace".parse().unwrap());
    }

    #[test]
    fn fn_with_a_keypad_digit_listens_for_the_keypad() {
        assert_eq!(hotkey("fn+num1"), "fn+keypad1".parse().unwrap());
    }

    #[test]
    fn fn_alone_is_a_modifier_only_hotkey() {
        assert_eq!(hotkey("fn"), "fn".parse().unwrap());
    }
}
