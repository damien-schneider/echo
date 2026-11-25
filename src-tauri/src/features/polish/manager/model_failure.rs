use std::fmt;

use crate::managers::model::DownloadFailure;

use super::super::{polish_failure_status, PolishFailureStage};

/// The one sentence a language-model command answers with; the cause chain stays in the log.
#[derive(Debug)]
pub(super) enum LanguageModelFailure {
    NoSpace { needed_mb: u64 },
    Download,
    Damaged,
    Switch,
    Stage(PolishFailureStage),
}

impl fmt::Display for LanguageModelFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoSpace { needed_mb } => write!(
                formatter,
                "Not enough storage. Free at least {needed_mb} MB, then retry."
            ),
            Self::Download => {
                formatter.write_str("Download failed. Check your connection, then retry.")
            }
            Self::Damaged => {
                formatter.write_str("The download was damaged. Retry to download it again.")
            }
            Self::Switch => {
                formatter.write_str("Couldn't load this model. The previous model is still active.")
            }
            Self::Stage(stage) => formatter.write_str(polish_failure_status(*stage).message),
        }
    }
}

impl LanguageModelFailure {
    fn at(stage: PolishFailureStage, error: &anyhow::Error) -> Self {
        if stage != PolishFailureStage::Download {
            return Self::Stage(stage);
        }
        match error.downcast_ref::<DownloadFailure>() {
            Some(DownloadFailure::NoSpace { needed_mb, .. }) => Self::NoSpace {
                needed_mb: *needed_mb,
            },
            Some(DownloadFailure::Damaged { .. }) => Self::Damaged,
            None => Self::Download,
        }
    }
}

pub(super) fn failed_at(stage: PolishFailureStage, error: anyhow::Error) -> anyhow::Error {
    let failure = LanguageModelFailure::at(stage, &error);
    error.context(failure)
}

pub(crate) fn language_model_message(error: &anyhow::Error) -> String {
    log::error!("Language model operation failed: {error:#}");
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::{failed_at, LanguageModelFailure};
    use crate::features::polish::PolishFailureStage;
    use crate::managers::model::DownloadFailure;

    fn message(stage: PolishFailureStage, error: anyhow::Error) -> String {
        failed_at(stage, error).to_string()
    }

    #[test]
    fn a_full_disk_names_only_the_space_to_free() {
        let error = anyhow::Error::new(DownloadFailure::NoSpace {
            model: "Gemma 4 E2B".to_owned(),
            needed_mb: 812,
        });

        assert_eq!(
            message(PolishFailureStage::Download, error),
            "Not enough storage. Free at least 812 MB, then retry."
        );
    }

    #[test]
    fn a_checksum_mismatch_asks_for_a_fresh_download_through_added_context() {
        let error = anyhow::Error::new(DownloadFailure::Damaged {
            model: "gemma-4-e2b".to_owned(),
        })
        .context("Installing the download");

        assert_eq!(
            message(PolishFailureStage::Download, error),
            "The download was damaged. Retry to download it again."
        );
    }

    #[test]
    fn any_other_download_fault_reads_as_a_connection_problem() {
        let error = anyhow::anyhow!("error sending request for url (https://huggingface.co)");

        assert_eq!(
            message(PolishFailureStage::Download, error),
            "Download failed. Check your connection, then retry."
        );
    }

    #[test]
    fn a_failure_shows_one_sentence_and_keeps_its_cause_for_the_log() {
        let error = failed_at(
            PolishFailureStage::Loading,
            anyhow::anyhow!("Polish runtime did not become ready within 60 seconds"),
        );

        assert_eq!(
            super::language_model_message(&error),
            LanguageModelFailure::Stage(PolishFailureStage::Loading).to_string()
        );
        assert!(format!("{error:#}").ends_with("within 60 seconds"));
    }
}
