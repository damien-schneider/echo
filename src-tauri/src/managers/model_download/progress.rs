use crate::managers::model::DownloadProgress;
use std::time::Duration;

const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Default)]
pub(super) struct ProgressCadence {
    last_emitted: Option<Duration>,
    emitted_terminal: bool,
}

impl ProgressCadence {
    pub(super) fn should_emit(&mut self, elapsed: Duration, is_terminal: bool) -> bool {
        if self.emitted_terminal {
            return false;
        }
        if is_terminal {
            self.emitted_terminal = true;
            self.last_emitted = Some(elapsed);
            return true;
        }
        let should_emit = self
            .last_emitted
            .is_none_or(|last| elapsed.saturating_sub(last) >= PROGRESS_EMIT_INTERVAL);
        if should_emit {
            self.last_emitted = Some(elapsed);
        }
        should_emit
    }
}

pub(super) fn progress_for(model_id: &str, downloaded: u64, total: u64) -> DownloadProgress {
    let percentage = if total == 0 {
        0.0
    } else {
        (downloaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
    };
    DownloadProgress {
        model_id: model_id.to_string(),
        downloaded,
        total,
        percentage,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn initial_progress_is_emitted_immediately() {
        let mut cadence = ProgressCadence::default();

        assert!(cadence.should_emit(Duration::ZERO, false));
        assert!(!cadence.should_emit(Duration::from_millis(1), false));
    }

    #[test]
    fn progress_is_throttled_to_one_update_per_hundred_milliseconds() {
        let mut cadence = ProgressCadence::default();

        assert!(cadence.should_emit(Duration::ZERO, false));
        assert!(!cadence.should_emit(Duration::from_millis(99), false));
        assert!(cadence.should_emit(Duration::from_millis(100), false));
        assert!(!cadence.should_emit(Duration::from_millis(199), false));
        assert!(cadence.should_emit(Duration::from_millis(200), false));
    }

    #[test]
    fn terminal_progress_bypasses_throttle_once() {
        let mut cadence = ProgressCadence::default();

        assert!(cadence.should_emit(Duration::ZERO, false));
        assert!(cadence.should_emit(Duration::from_millis(5), true));
        assert!(!cadence.should_emit(Duration::from_millis(105), true));
    }

    #[test]
    fn percentage_never_exceeds_frontend_schema_bounds() {
        let progress = progress_for("polish", 125, 100);

        assert_eq!(progress.percentage, 100.0);
    }
}
