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
}
