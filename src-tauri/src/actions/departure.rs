use crate::dictation::Landing;
use tauri::AppHandle;

pub(super) trait Departure {
    fn land(&self, landing: Option<Landing>, text: String);
    fn hide_island(&self);
}

pub(super) struct AppDeparture<'a>(pub(super) &'a AppHandle);

impl Departure for AppDeparture<'_> {
    fn land(&self, landing: Option<Landing>, text: String) {
        crate::dictation::deliver(self.0, landing, text);
    }

    fn hide_island(&self) {
        crate::utils::hide_recording_overlay(self.0);
    }
}

/// The island is all that says words are coming, so it waits out the paste; anything else lands where it stood.
pub(super) fn depart(departure: &impl Departure, landing: Option<Landing>, text: String) {
    if landing == Some(Landing::Caret) {
        departure.land(landing, text);
        departure.hide_island();
    } else {
        departure.hide_island();
        departure.land(landing, text);
    }
}

#[cfg(test)]
mod tests {
    use super::{depart, Departure};
    use crate::dictation::Landing;
    use std::cell::Cell;

    struct Island {
        is_shown: Cell<bool>,
        was_shown_at_landing: Cell<Option<bool>>,
    }

    impl Departure for Island {
        fn land(&self, _landing: Option<Landing>, _text: String) {
            self.was_shown_at_landing.set(Some(self.is_shown.get()));
        }

        fn hide_island(&self) {
            self.is_shown.set(false);
        }
    }

    fn departed(landing: Option<Landing>) -> Island {
        let island = Island {
            is_shown: Cell::new(true),
            was_shown_at_landing: Cell::new(None),
        };
        depart(&island, landing, "hello there".to_string());
        island
    }

    #[test]
    fn the_island_stays_up_until_the_paste_is_out_and_only_then_leaves() {
        let island = departed(Some(Landing::Caret));
        assert_eq!(island.was_shown_at_landing.get(), Some(true));
        assert!(!island.is_shown.get());
    }

    #[test]
    fn a_transcript_echo_may_not_paste_warns_only_after_the_island_left() {
        let island = departed(Some(Landing::Unpermitted));
        assert_eq!(island.was_shown_at_landing.get(), Some(false));
    }

    #[test]
    fn an_empty_transcript_still_closes_the_island() {
        let island = departed(None);
        assert!(!island.is_shown.get());
    }
}
