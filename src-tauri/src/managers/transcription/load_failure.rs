use transcribe_cpp::Error as EngineError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum LoadFailureCause {
    FileMissing,
    FileUnreadable,
    OutOfMemory,
    Backend(String),
    Other(String),
}

pub(super) fn load_failure_cause(
    error: &anyhow::Error,
    file_is_installed: bool,
) -> LoadFailureCause {
    if !file_is_installed {
        return LoadFailureCause::FileMissing;
    }
    match error.downcast_ref::<EngineError>() {
        Some(EngineError::ModelFileNotFound(_)) => LoadFailureCause::FileMissing,
        Some(EngineError::ModelLoad(_)) => LoadFailureCause::FileUnreadable,
        Some(EngineError::OutOfMemory(_)) => LoadFailureCause::OutOfMemory,
        Some(EngineError::Backend(detail)) => LoadFailureCause::Backend(detail.clone()),
        Some(engine_error) => LoadFailureCause::Other(engine_error.to_string()),
        None => LoadFailureCause::Other(format!("{error:#}")),
    }
}

pub(super) fn load_failure_message(model_name: &str, cause: &LoadFailureCause) -> String {
    match cause {
        LoadFailureCause::FileMissing => format!(
            "The {model_name} transcription model is missing from this computer. Download it again in Settings → Models."
        ),
        LoadFailureCause::FileUnreadable => format!(
            "The {model_name} transcription model file is damaged. Delete it in Settings → Models, then download it again."
        ),
        LoadFailureCause::OutOfMemory => format!(
            "There is not enough free memory to load the {model_name} transcription model. Close other apps, or choose a smaller model in Settings → Models."
        ),
        LoadFailureCause::Backend(detail) => format!(
            "The {model_name} transcription model could not start on this computer's graphics backend ({detail}). Restart Echo and try again."
        ),
        LoadFailureCause::Other(detail) => format!(
            "The {model_name} transcription model could not be loaded ({detail}). Restart Echo; if it keeps failing, delete the model in Settings → Models and download it again."
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::{load_failure_cause, load_failure_message, LoadFailureCause};
    use anyhow::Context;
    use transcribe_cpp::Error as EngineError;

    fn engine_failure(error: EngineError) -> anyhow::Error {
        Err::<(), _>(error)
            .context("load Whisper model /models/ggml-medium-q5_0.bin")
            .unwrap_err()
    }

    fn message_for(error: &anyhow::Error, file_is_installed: bool) -> String {
        load_failure_message("Medium", &load_failure_cause(error, file_is_installed))
    }

    #[test]
    fn a_model_whose_file_is_gone_asks_for_a_new_download() {
        let error = anyhow::anyhow!("Complete model file not found: medium");

        assert_eq!(
            message_for(&error, false),
            "The Medium transcription model is missing from this computer. Download it again in Settings → Models."
        );
    }

    #[test]
    fn a_file_the_engine_cannot_find_asks_for_a_new_download() {
        let error = engine_failure(EngineError::ModelFileNotFound("no such file".to_string()));

        assert_eq!(
            load_failure_cause(&error, true),
            LoadFailureCause::FileMissing
        );
    }

    #[test]
    fn a_corrupt_model_file_asks_to_delete_and_download_it_again() {
        let error = engine_failure(EngineError::ModelLoad("invalid GGUF magic".to_string()));

        assert_eq!(
            message_for(&error, true),
            "The Medium transcription model file is damaged. Delete it in Settings → Models, then download it again."
        );
    }

    #[test]
    fn running_out_of_memory_suggests_freeing_memory_or_a_smaller_model() {
        let error = engine_failure(EngineError::OutOfMemory("metal buffer".to_string()));

        assert_eq!(
            message_for(&error, true),
            "There is not enough free memory to load the Medium transcription model. Close other apps, or choose a smaller model in Settings → Models."
        );
    }

    #[test]
    fn a_backend_failure_names_what_the_backend_reported() {
        let error = engine_failure(EngineError::Backend("Metal device unavailable".to_string()));

        assert_eq!(
            message_for(&error, true),
            "The Medium transcription model could not start on this computer's graphics backend (Metal device unavailable). Restart Echo and try again."
        );
    }

    #[test]
    fn an_unexpected_engine_failure_keeps_its_own_words() {
        let error = engine_failure(EngineError::VersionMismatch(
            "library 0.4.2, headers 0.4.1".to_string(),
        ));

        assert_eq!(
            message_for(&error, true),
            "The Medium transcription model could not be loaded (native library version mismatch: library 0.4.2, headers 0.4.1). Restart Echo; if it keeps failing, delete the model in Settings → Models and download it again."
        );
    }

    #[test]
    fn a_failure_outside_the_engine_keeps_its_whole_cause() {
        let error = anyhow::anyhow!("permission denied").context("open model file");

        assert_eq!(
            load_failure_cause(&error, true),
            LoadFailureCause::Other("open model file: permission denied".to_string())
        );
    }
}
