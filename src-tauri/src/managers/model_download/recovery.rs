/// What to do with a `.partial` file found before a transfer starts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum PartialRecovery {
    Resume,
    Verify,
    Discard,
}

pub(super) fn partial_recovery(partial_size: u64, expected_size: u64) -> PartialRecovery {
    if expected_size == 0 || partial_size < expected_size {
        return PartialRecovery::Resume;
    }
    if partial_size == expected_size {
        return PartialRecovery::Verify;
    }
    PartialRecovery::Discard
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shorter_partial_resumes_where_it_stopped() {
        assert_eq!(partial_recovery(1_024, 2_048), PartialRecovery::Resume);
        assert_eq!(partial_recovery(0, 2_048), PartialRecovery::Resume);
    }

    #[test]
    fn complete_partial_is_verified_instead_of_downloaded_again() {
        assert_eq!(partial_recovery(2_048, 2_048), PartialRecovery::Verify);
    }

    /// A range request past the end of the artifact answers HTTP 416, so an
    /// oversized leftover would dead-end every retry until it is discarded.
    #[test]
    fn oversized_partial_is_discarded_instead_of_resumed_into_a_range_error() {
        assert_eq!(partial_recovery(2_049, 2_048), PartialRecovery::Discard);
    }

    #[test]
    fn unknown_artifact_size_always_resumes() {
        assert_eq!(partial_recovery(4_096, 0), PartialRecovery::Resume);
    }
}
