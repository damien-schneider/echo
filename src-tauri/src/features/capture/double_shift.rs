use std::time::{Duration, Instant};

pub(super) const DOUBLE_SHIFT_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ShortcutProgress {
    FirstTap,
    Complete,
}

#[derive(Debug)]
pub(super) struct DoubleShiftDetector {
    interval: Duration,
    last_release: Option<Instant>,
    current_press_started_at: Option<Instant>,
    current_press_valid: bool,
}

impl DoubleShiftDetector {
    pub(super) fn new(interval: Duration) -> Self {
        Self {
            interval,
            last_release: None,
            current_press_started_at: None,
            current_press_valid: false,
        }
    }

    pub(super) fn update_shift(&mut self, is_down: bool, now: Instant) -> Option<ShortcutProgress> {
        if is_down {
            if self.current_press_started_at.is_some() {
                self.current_press_valid = false;
            } else {
                self.current_press_started_at = Some(now);
                self.current_press_valid = true;
            }
            return None;
        }

        let started_at = self.current_press_started_at.take()?;
        if !std::mem::take(&mut self.current_press_valid)
            || now.duration_since(started_at) > self.interval
        {
            self.last_release = None;
            return None;
        }

        let is_double_tap = self
            .last_release
            .is_some_and(|last| now.duration_since(last) <= self.interval);
        self.last_release = if is_double_tap { None } else { Some(now) };
        Some(if is_double_tap {
            ShortcutProgress::Complete
        } else {
            ShortcutProgress::FirstTap
        })
    }

    pub(super) fn cancel(&mut self) {
        self.last_release = None;
        self.current_press_started_at = None;
        self.current_press_valid = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_two_complete_shift_taps_inside_the_interval() {
        let start = Instant::now();
        let mut detector = DoubleShiftDetector::new(DOUBLE_SHIFT_INTERVAL);

        assert_eq!(detector.update_shift(true, start), None);
        assert_eq!(
            detector.update_shift(false, start + Duration::from_millis(20)),
            Some(ShortcutProgress::FirstTap)
        );
        assert_eq!(
            detector.update_shift(true, start + Duration::from_millis(200)),
            None
        );
        assert_eq!(
            detector.update_shift(false, start + Duration::from_millis(220)),
            Some(ShortcutProgress::Complete)
        );
    }

    #[test]
    fn ignores_slow_or_interrupted_shift_taps() {
        let start = Instant::now();
        let mut detector = DoubleShiftDetector::new(DOUBLE_SHIFT_INTERVAL);

        detector.update_shift(true, start);
        detector.update_shift(false, start + Duration::from_millis(20));
        detector.update_shift(true, start + Duration::from_millis(600));
        assert_eq!(
            detector.update_shift(false, start + Duration::from_millis(620)),
            Some(ShortcutProgress::FirstTap)
        );

        detector.update_shift(true, start + Duration::from_millis(700));
        detector.cancel();
        assert_eq!(
            detector.update_shift(false, start + Duration::from_millis(720)),
            None
        );
        detector.update_shift(true, start + Duration::from_millis(800));
        assert_eq!(
            detector.update_shift(false, start + Duration::from_millis(820)),
            Some(ShortcutProgress::FirstTap)
        );
    }

    #[test]
    fn ignores_held_shift_presses() {
        let start = Instant::now();
        let mut detector = DoubleShiftDetector::new(DOUBLE_SHIFT_INTERVAL);

        detector.update_shift(true, start);
        assert_eq!(
            detector.update_shift(false, start + Duration::from_secs(2)),
            None
        );
        detector.update_shift(true, start + Duration::from_millis(2100));
        assert_eq!(
            detector.update_shift(false, start + Duration::from_millis(2120)),
            Some(ShortcutProgress::FirstTap)
        );
    }

    #[test]
    fn ignores_overlapping_shift_keys() {
        let start = Instant::now();
        let mut detector = DoubleShiftDetector::new(DOUBLE_SHIFT_INTERVAL);

        detector.update_shift(true, start);
        detector.update_shift(true, start + Duration::from_millis(10));
        detector.update_shift(true, start + Duration::from_millis(20));
        assert_eq!(
            detector.update_shift(false, start + Duration::from_millis(30)),
            None
        );
        detector.update_shift(true, start + Duration::from_millis(100));
        assert_eq!(
            detector.update_shift(false, start + Duration::from_millis(120)),
            Some(ShortcutProgress::FirstTap)
        );
    }
}
