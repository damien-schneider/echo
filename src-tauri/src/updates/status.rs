use serde::Serialize;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum UpdatePhase {
    Available,
    Checking,
    Downloading,
    Error,
    #[default]
    Idle,
    Installing,
    Unsupported,
}

impl UpdatePhase {
    /// A phase the user must not interrupt with another check or install.
    pub(crate) fn is_busy(self) -> bool {
        matches!(
            self,
            UpdatePhase::Checking | UpdatePhase::Downloading | UpdatePhase::Installing
        )
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateSnapshot {
    pub(crate) error: Option<String>,
    pub(crate) phase: UpdatePhase,
    pub(crate) progress: Option<u8>,
    pub(crate) version: Option<String>,
}

impl UpdateSnapshot {
    /// Survives the next check so the UI keeps offering it.
    pub(crate) fn checking(&self) -> Self {
        Self {
            error: None,
            phase: UpdatePhase::Checking,
            progress: None,
            version: self.version.clone(),
        }
    }

    pub(crate) fn available(version: String) -> Self {
        Self {
            error: None,
            phase: UpdatePhase::Available,
            progress: None,
            version: Some(version),
        }
    }

    pub(crate) fn up_to_date() -> Self {
        Self::default()
    }

    /// A dev build runs from target/, not from a bundle the updater can swap.
    pub(crate) fn unsupported() -> Self {
        Self {
            error: None,
            phase: UpdatePhase::Unsupported,
            progress: None,
            version: None,
        }
    }

    pub(crate) fn downloading(&self, progress: Option<u8>) -> Self {
        Self {
            error: None,
            phase: UpdatePhase::Downloading,
            progress,
            version: self.version.clone(),
        }
    }

    pub(crate) fn installing(&self) -> Self {
        Self {
            error: None,
            phase: UpdatePhase::Installing,
            progress: Some(100),
            version: self.version.clone(),
        }
    }

    /// Bundle already swapped — retrying would reinstall it.
    pub(crate) fn awaiting_restart() -> Self {
        Self {
            error: Some("Update installed. Restart Echo to finish.".to_string()),
            phase: UpdatePhase::Error,
            progress: None,
            version: None,
        }
    }

    /// A failure keeps the version so the notice stays actionable as a retry.
    pub(crate) fn failed(&self, error: String) -> Self {
        Self {
            error: Some(error),
            phase: UpdatePhase::Error,
            progress: None,
            version: self.version.clone(),
        }
    }
}

pub(crate) fn download_percent(downloaded: u64, total: Option<u64>) -> Option<u8> {
    let total = total.filter(|bytes| *bytes > 0)?;
    let percent = downloaded.saturating_mul(100) / total;
    Some(percent.min(100) as u8)
}

#[cfg(test)]
mod tests {
    use super::{download_percent, UpdatePhase, UpdateSnapshot};

    #[test]
    fn a_fresh_app_reports_nothing_to_install() {
        let snapshot = UpdateSnapshot::default();

        assert_eq!(snapshot.phase, UpdatePhase::Idle);
        assert!(!snapshot.phase.is_busy());
        assert_eq!(snapshot.version, None);
    }

    #[test]
    fn only_running_work_blocks_another_request() {
        assert!(UpdatePhase::Checking.is_busy());
        assert!(UpdatePhase::Downloading.is_busy());
        assert!(UpdatePhase::Installing.is_busy());
        assert!(!UpdatePhase::Available.is_busy());
        assert!(!UpdatePhase::Error.is_busy());
    }

    #[test]
    fn rechecking_keeps_the_version_already_offered() {
        let available = UpdateSnapshot::available("0.5.0".to_string());

        let rechecking = available.checking();

        assert_eq!(rechecking.phase, UpdatePhase::Checking);
        assert_eq!(rechecking.version.as_deref(), Some("0.5.0"));
        assert_eq!(rechecking.error, None);
    }

    #[test]
    fn a_check_that_finds_nothing_clears_the_previous_offer() {
        let cleared = UpdateSnapshot::up_to_date();

        assert_eq!(cleared.phase, UpdatePhase::Idle);
        assert_eq!(cleared.version, None);
        assert_eq!(cleared.progress, None);
    }

    #[test]
    fn download_and_install_carry_the_version_being_applied() {
        let available = UpdateSnapshot::available("0.5.0".to_string());

        let downloading = available.downloading(Some(42));
        let installing = downloading.installing();

        assert_eq!(downloading.phase, UpdatePhase::Downloading);
        assert_eq!(downloading.progress, Some(42));
        assert_eq!(installing.phase, UpdatePhase::Installing);
        assert_eq!(installing.progress, Some(100));
        assert_eq!(installing.version.as_deref(), Some("0.5.0"));
    }

    #[test]
    fn a_failure_stays_retryable_on_the_same_version() {
        let failed = UpdateSnapshot::available("0.5.0".to_string())
            .downloading(Some(10))
            .failed("Could not reach the update server.".to_string());

        assert_eq!(failed.phase, UpdatePhase::Error);
        assert_eq!(failed.version.as_deref(), Some("0.5.0"));
        assert_eq!(failed.progress, None);
        assert_eq!(
            failed.error.as_deref(),
            Some("Could not reach the update server.")
        );
    }

    #[test]
    fn an_installed_update_that_cannot_restart_offers_no_retry() {
        let waiting = UpdateSnapshot::awaiting_restart();

        assert_eq!(waiting.phase, UpdatePhase::Error);
        assert_eq!(waiting.version, None);
        assert_eq!(
            waiting.error.as_deref(),
            Some("Update installed. Restart Echo to finish.")
        );
    }

    #[test]
    fn a_build_without_an_updater_offers_nothing_and_blocks_nothing() {
        let unsupported = UpdateSnapshot::unsupported();

        assert_eq!(unsupported.phase, UpdatePhase::Unsupported);
        assert!(!unsupported.phase.is_busy());
        assert_eq!(unsupported.version, None);
        assert_eq!(unsupported.error, None);
    }

    #[test]
    fn progress_needs_a_known_total_and_never_passes_one_hundred() {
        assert_eq!(download_percent(50, Some(200)), Some(25));
        assert_eq!(download_percent(0, Some(200)), Some(0));
        assert_eq!(download_percent(400, Some(200)), Some(100));
        assert_eq!(download_percent(50, None), None);
        assert_eq!(download_percent(50, Some(0)), None);
    }
}
