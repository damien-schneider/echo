use crate::caret::CaretSight;
use std::sync::{Arc, Mutex, PoisonError};

struct Spoken {
    dictation: u64,
    sight: CaretSight,
}

/// Asking for the caret waits on another app, so the answer arrives aside from the dictation.
pub(super) struct SpokenCaretSight(Arc<Mutex<Spoken>>);

impl SpokenCaretSight {
    pub(super) fn new() -> Self {
        Self(Arc::new(Mutex::new(Spoken {
            dictation: 0,
            sight: CaretSight::Blind,
        })))
    }

    pub(super) fn probe(
        &self,
        look: impl FnOnce() -> CaretSight + Send + 'static,
    ) -> std::thread::JoinHandle<()> {
        let spoken = Arc::clone(&self.0);
        let dictation = {
            let mut current = spoken.lock().unwrap_or_else(PoisonError::into_inner);
            current.dictation += 1;
            current.sight = CaretSight::Blind;
            current.dictation
        };
        std::thread::spawn(move || {
            let sight = look();
            let mut current = spoken.lock().unwrap_or_else(PoisonError::into_inner);
            if current.dictation == dictation {
                current.sight = sight;
            }
        })
    }

    pub(super) fn sight(&self) -> CaretSight {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).sight
    }
}

#[cfg(test)]
mod tests {
    use super::SpokenCaretSight;
    use crate::caret::CaretSight;
    use std::sync::mpsc;

    #[test]
    fn an_app_slow_to_answer_never_holds_up_the_dictation() {
        let spoken = SpokenCaretSight::new();
        let (answer, waiting) = mpsc::channel::<()>();

        let probe = spoken.probe(move || {
            let _ = waiting.recv();
            CaretSight::Affirmed
        });

        assert_eq!(spoken.sight(), CaretSight::Blind);
        answer.send(()).expect("the probe is still waiting");
        probe.join().expect("the probe finishes");
        assert_eq!(spoken.sight(), CaretSight::Affirmed);
    }

    #[test]
    fn a_new_dictation_forgets_the_caret_of_the_previous_one() {
        let spoken = SpokenCaretSight::new();
        spoken
            .probe(|| CaretSight::Affirmed)
            .join()
            .expect("the first probe finishes");
        let (answer, waiting) = mpsc::channel::<()>();

        let probe = spoken.probe(move || {
            let _ = waiting.recv();
            CaretSight::DeniedByRole
        });

        assert_eq!(spoken.sight(), CaretSight::Blind);
        answer.send(()).expect("the probe is still waiting");
        probe.join().expect("the second probe finishes");
    }

    #[test]
    fn a_late_answer_about_an_earlier_dictation_is_ignored() {
        let spoken = SpokenCaretSight::new();
        let (answer, waiting) = mpsc::channel::<()>();
        let earlier = spoken.probe(move || {
            let _ = waiting.recv();
            CaretSight::DeniedByRole
        });
        spoken
            .probe(|| CaretSight::Affirmed)
            .join()
            .expect("the current probe finishes");

        answer.send(()).expect("the earlier probe is still waiting");
        earlier.join().expect("the earlier probe finishes");

        assert_eq!(spoken.sight(), CaretSight::Affirmed);
    }
}
