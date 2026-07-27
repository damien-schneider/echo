#[path = "lifecycle/app_exit.rs"]
pub(crate) mod app_exit;
#[path = "lifecycle/idle_release.rs"]
pub(crate) mod idle_release;
pub(crate) mod manager;
mod platform;
mod policy;
mod runtime;
mod selection;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PolishState {
    NotDownloaded,
    Preparing,
    Downloading,
    Verifying,
    Loading,
    Ready,
    Repair,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PolishStatus {
    state: PolishState,
    message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PolishPreparationPlan {
    VerifyInstalled,
    RecoverDownload,
    Download,
}

impl PolishPreparationPlan {
    fn requires_preload_verification(self) -> bool {
        self == Self::VerifyInstalled
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PolishPreparationIntent {
    Download,
    Repair,
}

impl PolishPreparationIntent {
    fn resets_runtime(self) -> bool {
        self == Self::Repair
    }

    fn reuses_ready_status(self) -> bool {
        self == Self::Download
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PolishUsePreparation {
    MissingModel,
    EnsureRuntime,
    VerifyAndLoad,
}

fn polish_use_preparation(is_downloaded: bool, status: PolishState) -> PolishUsePreparation {
    if !is_downloaded {
        return PolishUsePreparation::MissingModel;
    }
    if status == PolishState::Ready {
        return PolishUsePreparation::EnsureRuntime;
    }
    PolishUsePreparation::VerifyAndLoad
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PolishFailureStage {
    Waiting,
    Runtime,
    Verification,
    Download,
    Loading,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PolishFailureStatus {
    message: &'static str,
}

fn polish_failure_status(stage: PolishFailureStage) -> PolishFailureStatus {
    let message = match stage {
        PolishFailureStage::Waiting => {
            "Another Polish operation did not finish. Restart Echo and try again."
        }
        PolishFailureStage::Runtime => {
            "The local Polish service is missing. Reinstall Echo to restore it."
        }
        PolishFailureStage::Verification => {
            "The installed Polish model could not be verified. Choose Repair to download a clean copy."
        }
        PolishFailureStage::Download => {
            "The Polish model download failed. Check your connection and storage, then retry."
        }
        PolishFailureStage::Loading => {
            "The local Polish service could not start. Restart Echo, then choose Repair."
        }
    };
    PolishFailureStatus { message }
}

fn polish_failure_updates_shared_status(stage: PolishFailureStage) -> bool {
    stage != PolishFailureStage::Waiting
}

fn polish_preparation_plan(
    is_downloaded: bool,
    partial_size: u64,
    expected_size: u64,
) -> PolishPreparationPlan {
    if is_downloaded {
        return PolishPreparationPlan::VerifyInstalled;
    }
    if expected_size > 0 && partial_size >= expected_size {
        return PolishPreparationPlan::RecoverDownload;
    }
    PolishPreparationPlan::Download
}

/// A duplicate request rides the running task's status and progress events instead of queueing.
fn polish_joins_active_operation(state: PolishState) -> bool {
    matches!(
        state,
        PolishState::Downloading | PolishState::Verifying | PolishState::Loading
    )
}

fn polish_status_for_availability(is_downloaded: bool) -> PolishStatus {
    if is_downloaded {
        return PolishStatus {
            state: PolishState::Preparing,
            message: "Preparing Polish".to_string(),
        };
    }
    PolishStatus {
        state: PolishState::NotDownloaded,
        message: "Download the local Polish model to enable proofreading.".to_string(),
    }
}

fn polish_warning_message(status: &PolishStatus) -> String {
    if status.message.trim().is_empty() {
        return "Polish is unavailable. Open Settings to repair the local model.".to_string();
    }
    status.message.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_model_waits_for_an_explicit_download() {
        let status = polish_status_for_availability(false);
        assert_eq!(status.state, PolishState::NotDownloaded);
        assert_eq!(
            status.message,
            "Download the local Polish model to enable proofreading."
        );
    }

    #[test]
    fn installed_model_can_be_prepared_at_startup() {
        assert_eq!(
            polish_status_for_availability(true).state,
            PolishState::Preparing
        );
    }

    #[test]
    fn installed_model_is_verified_without_reentering_download() {
        assert_eq!(
            polish_preparation_plan(true, 0, 2_497_280_448),
            PolishPreparationPlan::VerifyInstalled
        );
    }

    #[test]
    fn complete_partial_is_recovered_as_verification_not_zero_percent_download() {
        assert_eq!(
            polish_preparation_plan(false, 2_497_280_448, 2_497_280_448),
            PolishPreparationPlan::RecoverDownload
        );
    }

    #[test]
    fn missing_model_starts_a_real_download() {
        assert_eq!(
            polish_preparation_plan(false, 0, 2_497_280_448),
            PolishPreparationPlan::Download
        );
    }

    #[test]
    fn downloaded_artifacts_are_not_verified_a_second_time() {
        assert!(PolishPreparationPlan::VerifyInstalled.requires_preload_verification());
        assert!(!PolishPreparationPlan::RecoverDownload.requires_preload_verification());
        assert!(!PolishPreparationPlan::Download.requires_preload_verification());
    }

    #[test]
    fn warning_copy_uses_the_authoritative_sanitized_status() {
        let status = PolishStatus {
            state: PolishState::Repair,
            message: polish_failure_status(PolishFailureStage::Runtime)
                .message
                .to_string(),
        };

        assert_eq!(
            polish_warning_message(&status),
            "The local Polish service is missing. Reinstall Echo to restore it."
        );
    }

    #[test]
    fn terminal_statuses_are_actionable_without_exposing_internal_paths() {
        let statuses = [
            polish_failure_status(PolishFailureStage::Waiting),
            polish_failure_status(PolishFailureStage::Runtime),
            polish_failure_status(PolishFailureStage::Verification),
            polish_failure_status(PolishFailureStage::Download),
            polish_failure_status(PolishFailureStage::Loading),
        ];
        assert!(statuses.iter().all(|status| !status.message.contains('/')));
        assert_eq!(
            statuses[0].message,
            "Another Polish operation did not finish. Restart Echo and try again."
        );
        assert_eq!(
            statuses[2].message,
            "The installed Polish model could not be verified. Choose Repair to download a clean copy."
        );
    }

    #[test]
    fn waiting_failure_does_not_replace_active_operation_status() {
        assert!(!polish_failure_updates_shared_status(
            PolishFailureStage::Waiting
        ));
        assert!(polish_failure_updates_shared_status(
            PolishFailureStage::Download
        ));
    }

    #[test]
    fn repair_operations_reset_runtime_instead_of_reusing_ready_status() {
        assert!(PolishPreparationIntent::Repair.resets_runtime());
        assert!(!PolishPreparationIntent::Repair.reuses_ready_status());
    }

    #[test]
    fn duplicate_downloads_reuse_the_owner_ready_status() {
        assert!(!PolishPreparationIntent::Download.resets_runtime());
        assert!(PolishPreparationIntent::Download.reuses_ready_status());
    }

    /// A 2.5 GB transfer outlives any wait, so a second click attaches instead of timing out.
    #[test]
    fn a_second_request_joins_an_operation_already_in_flight() {
        assert!(polish_joins_active_operation(PolishState::Downloading));
        assert!(polish_joins_active_operation(PolishState::Verifying));
        assert!(polish_joins_active_operation(PolishState::Loading));
    }

    #[test]
    fn a_request_against_a_settled_status_still_takes_the_lock() {
        assert!(!polish_joins_active_operation(PolishState::Preparing));
        assert!(!polish_joins_active_operation(PolishState::NotDownloaded));
        assert!(!polish_joins_active_operation(PolishState::Ready));
        assert!(!polish_joins_active_operation(PolishState::Repair));
    }

    #[test]
    fn ready_polish_only_checks_the_runtime_process() {
        assert_eq!(
            polish_use_preparation(true, PolishState::Ready),
            PolishUsePreparation::EnsureRuntime
        );
    }

    #[test]
    fn installed_model_is_verified_during_first_startup_preparation() {
        assert_eq!(
            polish_use_preparation(true, PolishState::Preparing),
            PolishUsePreparation::VerifyAndLoad
        );
    }

    #[test]
    fn unavailable_model_never_enters_runtime_preparation() {
        assert_eq!(
            polish_use_preparation(false, PolishState::Ready),
            PolishUsePreparation::MissingModel
        );
    }
}
