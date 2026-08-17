use super::*;
use crate::features::polish::policy::MAX_POLISH_CHARACTERS;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

#[path = "selection/test_support.rs"]
mod test_support;
use test_support::{fixture, fixture_with_options, ClipboardFaults, FixtureOptions};

#[tokio::test]
async fn replaces_selection_and_restores_all_clipboard_formats() {
    let fixture = fixture("This are wrong.", "This is wrong.");
    let original = fixture.clipboard.current();
    let generation = fixture.cancellation.begin();

    let outcome = fixture
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .unwrap();

    assert_eq!(outcome, PolishOutcome::Replaced);
    assert_eq!(fixture.paste_count.load(Ordering::SeqCst), 1);
    assert_eq!(fixture.clipboard.current(), original);
}

#[tokio::test]
async fn restores_selected_line_structure_when_the_model_reflows_text() {
    let fixture = fixture(
        "This are wrong.\nKeep this second line.",
        "This is wrong. Keep this second line.",
    );
    let generation = fixture.cancellation.begin();

    let outcome = fixture
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .unwrap();

    assert_eq!(outcome, PolishOutcome::Replaced);
    assert_eq!(fixture.paste_count.load(Ordering::SeqCst), 1);
    assert_eq!(
        *fixture.pasted_text.lock().unwrap(),
        Some("This is wrong.\nKeep this second line.".to_string())
    );
}

#[tokio::test]
async fn rejected_output_explains_that_the_original_text_was_kept() {
    let fixture = fixture("longword\notherword", "longwordotherword");
    let generation = fixture.cancellation.begin();

    let error = fixture
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .unwrap_err();

    assert_eq!(
        error.to_string(),
        "Original text kept because Polish could not preserve it safely. Try a shorter selection."
    );
    assert_eq!(fixture.paste_count.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn captures_selection_identical_to_existing_clipboard() {
    let fixture = fixture("original clipboard", "Original clipboard.");
    let generation = fixture.cancellation.begin();

    assert_eq!(
        fixture
            .transaction
            .run(SelectionMode::ReplaceSelection, generation)
            .await
            .unwrap(),
        PolishOutcome::Replaced
    );
}

#[tokio::test]
async fn chat_capture_keeps_text_beyond_the_polish_limit() {
    let selection = "x".repeat(MAX_POLISH_CHARACTERS + 1);
    let fixture = fixture(&selection, "ignored");
    let generation = fixture.cancellation.begin();

    assert_eq!(
        fixture
            .transaction
            .capture_text(SelectionMode::ReplaceSelection, generation)
            .await
            .unwrap(),
        Some(selection)
    );
}

#[tokio::test]
async fn chat_capture_preserves_multiline_terminal_output() {
    let selection = "$ bun test\n31 pass\n0 fail";
    let fixture = fixture(selection, "ignored");
    let generation = fixture.cancellation.begin();

    assert_eq!(
        fixture
            .transaction
            .capture_text(SelectionMode::ReplaceSelection, generation)
            .await
            .unwrap(),
        Some(selection.to_string())
    );
}

#[tokio::test]
async fn restores_user_clipboard_change_made_during_inference() {
    let fixture = fixture_with_options(FixtureOptions {
        clipboard_change: Some("user changed clipboard"),
        ..FixtureOptions::default()
    });
    let generation = fixture.cancellation.begin();

    fixture
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .unwrap();

    assert_eq!(
        fixture.clipboard.read_text().unwrap(),
        "user changed clipboard"
    );
}

#[tokio::test(start_paused = true)]
async fn missing_selection_gives_up_within_the_copy_wait_budget() {
    let fixture = fixture_with_options(FixtureOptions {
        selection: "ignored",
        output: "Fixed.",
        copies_selection: false,
        ..FixtureOptions::default()
    });
    let original = fixture.clipboard.current();
    let generation = fixture.cancellation.begin();
    let started = Instant::now();

    assert_eq!(
        fixture
            .transaction
            .run(SelectionMode::ReplaceSelection, generation)
            .await
            .unwrap(),
        PolishOutcome::NoSelection
    );
    assert!(started.elapsed() < Duration::from_secs(2));
    assert_eq!(fixture.token_count_calls.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.polish_calls.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.paste_count.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.clipboard.current(), original);
}

/// Regression: a busy app answers the copy shortcut late and the selection reads as empty.
#[tokio::test(start_paused = true)]
async fn selection_answered_late_by_a_busy_application_is_still_captured() {
    let fixture = fixture_with_options(FixtureOptions {
        copy_delay: Duration::from_millis(400),
        ..FixtureOptions::default()
    });
    let generation = fixture.cancellation.begin();

    let outcome = fixture
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .unwrap();

    assert_eq!(outcome, PolishOutcome::Replaced);
    assert_eq!(
        *fixture.pasted_text.lock().unwrap(),
        Some("This is wrong.".to_string())
    );
}

/// The pasteboard is briefly empty between the clear and the write.
#[tokio::test(start_paused = true)]
async fn a_clipboard_that_reads_back_empty_does_not_end_the_wait() {
    let fixture = fixture_with_options(FixtureOptions {
        copy_delay: Duration::from_millis(100),
        faults: ClipboardFaults {
            unreadable_reads: 3,
            ..ClipboardFaults::default()
        },
        ..FixtureOptions::default()
    });
    let generation = fixture.cancellation.begin();

    let outcome = fixture
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .unwrap();

    assert_eq!(outcome, PolishOutcome::Replaced);
}

/// Restore is cleanup — a payload macOS refuses must not cost the polish.
#[tokio::test(start_paused = true)]
async fn a_clipboard_that_cannot_be_restored_still_polishes_the_selection() {
    let fixture = fixture_with_options(FixtureOptions {
        faults: ClipboardFaults {
            restore_fails: true,
            ..ClipboardFaults::default()
        },
        ..FixtureOptions::default()
    });
    let generation = fixture.cancellation.begin();

    let outcome = fixture
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .unwrap();

    assert_eq!(outcome, PolishOutcome::Replaced);
    assert_eq!(fixture.paste_count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn capture_phase_finishes_before_any_inference_work() {
    let fixture = fixture("This are wrong.", "This is wrong.");
    let original = fixture.clipboard.current();
    let generation = fixture.cancellation.begin();

    let captured = fixture
        .transaction
        .capture(SelectionMode::ReplaceSelection, generation)
        .await
        .unwrap();

    assert!(captured.is_some());
    assert_eq!(fixture.token_count_calls.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.polish_calls.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.clipboard.current(), original);
}

#[tokio::test]
async fn empty_copied_text_returns_without_inference() {
    let fixture = fixture_with_options(FixtureOptions {
        selection: "   ",
        output: "Fixed.",
        ..FixtureOptions::default()
    });
    let generation = fixture.cancellation.begin();

    assert_eq!(
        fixture
            .transaction
            .run(SelectionMode::ReplaceSelection, generation)
            .await
            .unwrap(),
        PolishOutcome::NoSelection
    );
    assert_eq!(fixture.token_count_calls.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.polish_calls.load(Ordering::SeqCst), 0);
    assert_eq!(fixture.paste_count.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn focus_loss_and_newer_invocation_never_paste() {
    let focus_lost = fixture_with_options(FixtureOptions {
        focus_change: Some("com.example.Other"),
        ..FixtureOptions::default()
    });
    let generation = focus_lost.cancellation.begin();

    assert!(focus_lost
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .is_err());
    assert_eq!(focus_lost.paste_count.load(Ordering::SeqCst), 0);

    let stale = fixture("This are wrong.", "This is wrong.");
    let generation = stale.cancellation.begin();
    stale.cancellation.cancel();
    assert!(stale
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .is_err());
    assert_eq!(stale.paste_count.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn token_limit_and_unchanged_output_do_not_paste() {
    let too_many = fixture_with_options(FixtureOptions {
        token_count: 1501,
        ..FixtureOptions::default()
    });
    let generation = too_many.cancellation.begin();
    assert!(too_many
        .transaction
        .run(SelectionMode::ReplaceSelection, generation)
        .await
        .is_err());

    let unchanged = fixture("Already correct.", "Already correct.");
    let generation = unchanged.cancellation.begin();
    assert_eq!(
        unchanged
            .transaction
            .run(SelectionMode::ReplaceSelection, generation)
            .await
            .unwrap(),
        PolishOutcome::Unchanged
    );
    assert_eq!(unchanged.paste_count.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn clipboard_only_mode_leaves_polished_text_copied() {
    let fixture = fixture("This are wrong.", "This is wrong.");
    fixture.clipboard.write_text("This are wrong.").unwrap();
    let generation = fixture.cancellation.begin();

    assert_eq!(
        fixture
            .transaction
            .run(SelectionMode::ClipboardOnly, generation)
            .await
            .unwrap(),
        PolishOutcome::Copied
    );
    assert_eq!(fixture.clipboard.read_text().unwrap(), "This is wrong.");
    assert_eq!(fixture.paste_count.load(Ordering::SeqCst), 0);
}
