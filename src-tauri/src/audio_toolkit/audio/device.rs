use cpal::traits::{DeviceTrait, HostTrait};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub(crate) struct SelectedDeviceCache<T> {
    entry: Arc<Mutex<Option<(String, T)>>>,
}

impl<T> Default for SelectedDeviceCache<T> {
    fn default() -> Self {
        Self {
            entry: Arc::new(Mutex::new(None)),
        }
    }
}

impl<T: Clone> SelectedDeviceCache<T> {
    pub(crate) fn resolve(&self, name: &str, resolver: impl FnOnce() -> Option<T>) -> Option<T> {
        let Ok(mut entry) = self.entry.lock() else {
            return resolver();
        };
        if let Some((cached_name, device)) = entry.as_ref() {
            if cached_name == name {
                return Some(device.clone());
            }
        }
        let device = resolver()?;
        *entry = Some((name.to_string(), device.clone()));
        Some(device)
    }

    pub(crate) fn invalidate(&self) {
        match self.entry.lock() {
            Ok(mut entry) => *entry = None,
            Err(poisoned) => *poisoned.into_inner() = None,
        }
    }

    /// A remembered device may be gone since, so one that fails to open is looked up afresh once.
    pub(crate) fn open_with<E: std::fmt::Display>(
        &self,
        name: &str,
        resolver: impl Fn() -> Option<T>,
        mut open: impl FnMut(Option<T>) -> Result<(), E>,
    ) -> Result<(), E> {
        let was_remembered = self.remembers(name);
        let Err(error) = open(self.resolve(name, &resolver)) else {
            return Ok(());
        };
        self.invalidate();
        if !was_remembered {
            return Err(error);
        }
        log::warn!("Remembered microphone '{name}' did not open ({error}), looking it up again");
        let reopened = open(self.resolve(name, &resolver));
        if reopened.is_err() {
            self.invalidate();
        }
        reopened
    }

    fn remembers(&self, name: &str) -> bool {
        let Ok(entry) = self.entry.lock() else {
            return false;
        };
        entry.as_ref().is_some_and(|(cached, _)| cached == name)
    }
}

pub struct CpalDeviceInfo {
    pub index: String,
    pub name: String,
    pub device: cpal::Device,
}

fn describe_devices(devices: impl Iterator<Item = cpal::Device>) -> Vec<CpalDeviceInfo> {
    devices
        .enumerate()
        .map(|(index, device)| CpalDeviceInfo {
            index: index.to_string(),
            name: device.name().unwrap_or_else(|_| "Unknown".into()),
            device,
        })
        .collect()
}

pub fn list_input_devices() -> Result<Vec<CpalDeviceInfo>, Box<dyn std::error::Error>> {
    let host = crate::audio_toolkit::get_cpal_host();
    Ok(describe_devices(host.input_devices()?))
}

pub fn list_output_devices() -> Result<Vec<CpalDeviceInfo>, Box<dyn std::error::Error>> {
    let host = crate::audio_toolkit::get_cpal_host();
    Ok(describe_devices(host.output_devices()?))
}

/// `None` when the device is gone or the system will not list any: the caller falls back to the default one.
pub(crate) fn input_device_named(name: &str) -> Option<cpal::Device> {
    match list_input_devices() {
        Ok(devices) => devices
            .into_iter()
            .find(|device| device.name == name)
            .map(|device| device.device),
        Err(error) => {
            log::debug!("Failed to list devices, using default: {error}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SelectedDeviceCache;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn selected_device_cache_resolves_each_name_once() {
        let cache = SelectedDeviceCache::default();
        let calls = AtomicUsize::new(0);

        let first = cache.resolve("Studio Mic", || {
            calls.fetch_add(1, Ordering::SeqCst);
            Some("device-a".to_string())
        });
        let second = cache.resolve("Studio Mic", || {
            calls.fetch_add(1, Ordering::SeqCst);
            Some("device-b".to_string())
        });

        assert_eq!(first.as_deref(), Some("device-a"));
        assert_eq!(second.as_deref(), Some("device-a"));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn selected_device_cache_reloads_after_invalidation() {
        let cache = SelectedDeviceCache::default();
        assert_eq!(cache.resolve("Studio Mic", || Some(1)), Some(1));

        cache.invalidate();

        assert_eq!(cache.resolve("Studio Mic", || Some(2)), Some(2));
    }

    #[test]
    fn selected_device_cache_does_not_reuse_a_different_name() {
        let cache = SelectedDeviceCache::default();
        assert_eq!(cache.resolve("Studio Mic", || Some(1)), Some(1));
        assert_eq!(cache.resolve("Laptop Mic", || Some(2)), Some(2));
    }

    fn refusing(stale: &'static str) -> impl FnMut(Option<&'static str>) -> Result<(), String> {
        move |device| match device {
            Some(handle) if handle == stale => Err(format!("{handle} is gone")),
            _ => Ok(()),
        }
    }

    #[test]
    fn a_remembered_device_that_no_longer_opens_is_looked_up_again() {
        let cache = SelectedDeviceCache::default();
        cache.resolve("AirPods", || Some("handle before reconnecting"));

        let opened = cache.open_with(
            "AirPods",
            || Some("handle after reconnecting"),
            refusing("handle before reconnecting"),
        );

        assert_eq!(opened, Ok(()));
    }

    #[test]
    fn a_remembered_device_that_left_the_system_gives_way_to_the_default_one() {
        let cache = SelectedDeviceCache::default();
        cache.resolve("USB Mic", || Some("unplugged handle"));

        let opened = cache.open_with("USB Mic", || None, refusing("unplugged handle"));

        assert_eq!(opened, Ok(()));
    }

    #[test]
    fn a_device_just_looked_up_is_not_opened_twice() {
        let cache = SelectedDeviceCache::default();
        let attempts = AtomicUsize::new(0);

        let opened = cache.open_with(
            "Studio Mic",
            || Some("busy handle"),
            |_| {
                attempts.fetch_add(1, Ordering::SeqCst);
                Err("in use by another app")
            },
        );

        assert_eq!(opened, Err("in use by another app"));
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn a_device_that_could_not_be_opened_is_not_remembered() {
        let cache = SelectedDeviceCache::default();
        let refused = cache.open_with("Studio Mic", || Some(1), |_| Err("in use"));
        assert_eq!(refused, Err("in use"));

        assert_eq!(cache.resolve("Studio Mic", || Some(2)), Some(2));
    }
}
