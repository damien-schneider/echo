use super::status::{download_percent, UpdateSnapshot};
use log::{info, warn};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::time::sleep;

pub(crate) const UPDATE_STATUS_EVENT: &str = "update-status";

const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
/// Startup is already busy loading models; the first check waits for it to pass.
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(20);
const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CheckTrigger {
    Auto,
    Manual,
}

#[derive(Default)]
struct UpdateRuntime {
    pending: Option<Update>,
    snapshot: UpdateSnapshot,
}

/// One owner app-wide — every window reads the same snapshot.
#[derive(Default)]
pub(crate) struct UpdateManager {
    runtime: Mutex<UpdateRuntime>,
}

impl UpdateManager {
    fn runtime(&self) -> MutexGuard<'_, UpdateRuntime> {
        self.runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(crate) fn snapshot(&self) -> UpdateSnapshot {
        self.runtime().snapshot.clone()
    }

    fn pending_update(&self) -> Option<Update> {
        self.runtime().pending.clone()
    }

    fn set_pending(&self, update: Option<Update>) {
        self.runtime().pending = update;
    }

    fn transition(
        &self,
        app: &AppHandle,
        next: impl FnOnce(&UpdateSnapshot) -> UpdateSnapshot,
    ) -> UpdateSnapshot {
        let snapshot = {
            let mut runtime = self.runtime();
            let next_snapshot = next(&runtime.snapshot);
            runtime.snapshot = next_snapshot.clone();
            next_snapshot
        };
        publish(app, &snapshot);
        snapshot
    }

    /// `None` — work already running, this request is dropped.
    fn begin(
        &self,
        app: &AppHandle,
        next: impl FnOnce(&UpdateSnapshot) -> UpdateSnapshot,
    ) -> Option<UpdateSnapshot> {
        let (previous, staged) = {
            let mut runtime = self.runtime();
            if runtime.snapshot.phase.is_busy() {
                return None;
            }
            let previous = runtime.snapshot.clone();
            let staged = next(&previous);
            runtime.snapshot = staged.clone();
            (previous, staged)
        };
        publish(app, &staged);
        Some(previous)
    }
}

fn publish(app: &AppHandle, snapshot: &UpdateSnapshot) {
    if let Err(error) = app.emit(UPDATE_STATUS_EVENT, snapshot) {
        warn!("[Updates] Failed to publish the update status: {error}");
    }
}

fn manager(app: &AppHandle) -> Arc<UpdateManager> {
    app.state::<Arc<UpdateManager>>().inner().clone()
}

pub(crate) fn snapshot(app: &AppHandle) -> UpdateSnapshot {
    manager(app).snapshot()
}

fn describe_error(error: tauri_plugin_updater::Error) -> String {
    use tauri_plugin_updater::Error;
    match error {
        Error::Reqwest(_) | Error::Network(_) => {
            "Echo could not reach the update server. Check your connection.".to_string()
        }
        Error::ReleaseNotFound | Error::TargetNotFound(_) | Error::TargetsNotFound(_) => {
            "No update was published for this platform yet.".to_string()
        }
        Error::Minisign(_) | Error::SignatureUtf8(_) | Error::Base64(_) => {
            "The update signature could not be verified, so nothing was installed.".to_string()
        }
        Error::Io(_) | Error::TempDirNotFound | Error::TempDirNotOnSameMountPoint => {
            "Echo could not write the update to disk.".to_string()
        }
        Error::EmptyEndpoints => "This build has no update endpoint configured.".to_string(),
        other => format!("The update failed: {other}"),
    }
}

async fn fetch_update(app: &AppHandle) -> Result<Option<Update>, String> {
    let updater = app
        .updater_builder()
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(describe_error)?;
    updater.check().await.map_err(describe_error)
}

pub(crate) async fn check(app: &AppHandle, trigger: CheckTrigger) -> UpdateSnapshot {
    let manager = manager(app);
    let Some(previous) = manager.begin(app, UpdateSnapshot::checking) else {
        return manager.snapshot();
    };

    match fetch_update(app).await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            info!("[Updates] Version {version} is available");
            manager.set_pending(Some(update));
            manager.transition(app, |_| UpdateSnapshot::available(version.clone()))
        }
        Ok(None) => {
            manager.set_pending(None);
            manager.transition(app, |_| UpdateSnapshot::up_to_date())
        }
        Err(error) => {
            warn!("[Updates] Check failed: {error}");
            match trigger {
                // Nobody asked for this check, so its failure stays in the log.
                CheckTrigger::Auto => manager.transition(app, |_| previous.clone()),
                CheckTrigger::Manual => manager.transition(app, |snapshot| snapshot.failed(error)),
            }
        }
    }
}

fn report_progress(
    app: &AppHandle,
    manager: &Arc<UpdateManager>,
) -> impl FnMut(usize, Option<u64>) {
    let app = app.clone();
    let manager = Arc::clone(manager);
    let mut downloaded: u64 = 0;
    let mut published = Some(0);
    move |chunk, total| {
        downloaded = downloaded.saturating_add(chunk as u64);
        let percent = download_percent(downloaded, total);
        if percent != published {
            published = percent;
            manager.transition(&app, |snapshot| snapshot.downloading(percent));
        }
    }
}

async fn download_and_install(
    app: &AppHandle,
    manager: &Arc<UpdateManager>,
    update: &Update,
) -> Result<(), String> {
    let finish_app = app.clone();
    let finish_manager = Arc::clone(manager);
    let on_finish = move || {
        finish_manager.transition(&finish_app, UpdateSnapshot::installing);
    };
    update
        .download_and_install(report_progress(app, manager), on_finish)
        .await
        .map_err(describe_error)
}

/// Windows hands off to its installer — this only runs where the bundle was swapped in place.
fn restart(app: &AppHandle) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        handle.restart();
    })
    .map_err(|error| error.to_string())
}

pub(crate) async fn install(app: &AppHandle) -> Result<(), String> {
    let manager = manager(app);
    if manager.snapshot().phase.is_busy() {
        return Ok(());
    }
    if manager.pending_update().is_none() {
        check(app, CheckTrigger::Manual).await;
    }
    let Some(update) = manager.pending_update() else {
        return Ok(());
    };
    if manager
        .begin(app, |snapshot| snapshot.downloading(Some(0)))
        .is_none()
    {
        return Ok(());
    }

    match download_and_install(app, &manager, &update).await {
        Ok(()) => {
            info!("[Updates] Installed version {}", update.version);
            manager.set_pending(None);
            if let Err(error) = restart(app) {
                warn!("[Updates] Failed to restart into the new version: {error}");
                manager.transition(app, |_| UpdateSnapshot::awaiting_restart());
            }
            Ok(())
        }
        Err(error) => {
            warn!("[Updates] Install failed: {error}");
            manager.transition(app, |snapshot| snapshot.failed(error.clone()));
            Err(error)
        }
    }
}

/// Slow loop after startup so a long-running session still sees a release.
pub(crate) fn watch(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        sleep(FIRST_CHECK_DELAY).await;
        loop {
            check(&app, CheckTrigger::Auto).await;
            sleep(CHECK_INTERVAL).await;
        }
    });
}
