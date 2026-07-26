use std::time::Duration;

const EAGER_INTERVAL: Duration = Duration::from_millis(5);
const EAGER_ATTEMPTS: usize = 8;
const PATIENT_INTERVAL: Duration = Duration::from_millis(25);
const PATIENT_ATTEMPTS: usize = 32;

/// How long the capture keeps looking at the clipboard after sending the copy
/// shortcut, one delay per look.
///
/// A copy crosses the OS event queue and the target application's main thread,
/// so the answer lands in a millisecond in a text field and hundreds of them in
/// a terminal or an editor busy elsewhere. The eager head keeps the common case
/// instant; the patient tail is what stops a slow application from being
/// reported to the user as an empty selection.
pub(super) fn copy_poll_delays() -> impl Iterator<Item = Duration> {
    std::iter::repeat_n(EAGER_INTERVAL, EAGER_ATTEMPTS)
        .chain(std::iter::repeat_n(PATIENT_INTERVAL, PATIENT_ATTEMPTS))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn total_wait() -> Duration {
        copy_poll_delays().sum()
    }

    #[test]
    fn wait_outlasts_an_application_that_answers_the_copy_late() {
        assert!(
            total_wait() >= Duration::from_millis(600),
            "a terminal or editor under load needs hundreds of milliseconds to \
             answer the copy shortcut, and giving up early reports a selection \
             the user can see as missing (waited {total:?})",
            total = total_wait()
        );
    }

    #[test]
    fn first_polls_stay_tight_for_a_responsive_application() {
        let head: Vec<Duration> = copy_poll_delays().take(8).collect();

        assert!(head.iter().all(|delay| *delay <= Duration::from_millis(5)));
        assert!(head.iter().sum::<Duration>() <= Duration::from_millis(50));
    }

    #[test]
    fn wait_stays_bounded_so_an_empty_selection_still_answers() {
        assert!(total_wait() <= Duration::from_millis(1_500));
    }
}
