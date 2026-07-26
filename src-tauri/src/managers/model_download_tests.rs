use super::attempt::attempt_failure_event;
use super::attempt::{download_phase, DownloadPhase};
use super::verification::{
    verify_file_sha256_with_progress, ModelVerificationEvent, VerificationTarget,
};
use super::{download_client, download_total_size, progress_for, DownloadPaths};
use std::path::Path;
use std::time::Duration;

fn verification_events(
    path: &Path,
    expected_sha256: &str,
) -> (anyhow::Result<()>, Vec<ModelVerificationEvent>) {
    let mut events = Vec::new();
    let result = verify_file_sha256_with_progress(
        VerificationTarget {
            expected_sha256,
            model_id: "polish-test",
            path,
        },
        |event| events.push(event),
    );
    (result, events)
}

#[test]
fn checksum_progress_starts_at_zero_and_finishes_at_real_file_size() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("model.gguf");
    std::fs::write(&path, b"abc").unwrap();
    let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    let (result, events) = verification_events(&path, expected);

    result.unwrap();
    assert_eq!(
        events.first(),
        Some(&ModelVerificationEvent::Started {
            model_id: "polish-test".to_string(),
        })
    );
    let progress = events
        .iter()
        .filter_map(|event| match event {
            ModelVerificationEvent::Progress(progress) => Some(progress),
            ModelVerificationEvent::Started { .. } => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(progress.len(), 2);
    assert_eq!(progress[0].downloaded, 0);
    assert_eq!(progress[0].total, 3);
    assert_eq!(progress[0].percentage, 0.0);
    assert_eq!(progress[1].downloaded, 3);
    assert_eq!(progress[1].total, 3);
    assert_eq!(progress[1].percentage, 100.0);
    assert!(progress
        .windows(2)
        .all(|window| window[0].downloaded <= window[1].downloaded));
}

#[test]
fn checksum_mismatch_still_emits_terminal_progress_before_failure() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("model.gguf");
    std::fs::write(&path, b"abc").unwrap();

    let (result, events) = verification_events(&path, &"0".repeat(64));

    assert!(result.is_err());
    let terminal = events.last().unwrap();
    assert_eq!(
        terminal,
        &ModelVerificationEvent::Progress(super::DownloadProgress {
            model_id: "polish-test".to_string(),
            percentage: 100.0,
            total: 3,
            downloaded: 3,
        })
    );
}

#[test]
fn verification_progress_serializes_for_the_tauri_boundary() {
    let payload = super::DownloadProgress {
        model_id: "polish-test".to_string(),
        percentage: 25.0,
        total: 400,
        downloaded: 100,
    };

    assert_eq!(
        serde_json::to_value(payload).unwrap(),
        serde_json::json!({
            "model_id": "polish-test",
            "percentage": 25.0,
            "total": 400,
            "downloaded": 100,
        })
    );
}

#[test]
fn download_paths_keep_partial_and_extracting_files_next_to_model() {
    let paths = DownloadPaths::new(Path::new("/models"), "model.gguf");

    assert_eq!(paths.model, Path::new("/models/model.gguf"));
    assert_eq!(paths.partial, Path::new("/models/model.gguf.partial"));
    assert_eq!(paths.extracting, Path::new("/models/model.gguf.extracting"));
}

#[test]
fn progress_handles_known_and_unknown_totals() {
    assert_eq!(progress_for("polish", 25, 100).percentage, 25.0);
    assert_eq!(progress_for("polish", 25, 0).percentage, 0.0);
}

#[test]
fn resumed_download_without_content_length_preserves_known_offset() {
    let total = download_total_size(128, None, 1_024);

    assert_eq!(total, 1_024);
    assert!(total >= 128);
    assert_eq!(download_total_size(128, Some(256), 1_024), 384);
    assert_eq!(download_total_size(0, None, 1_024), 1_024);
}

#[test]
fn resumed_unknown_total_never_falls_below_downloaded_bytes() {
    assert_eq!(download_total_size(128, None, 0), 128);
}

#[test]
fn complete_partial_verification_requires_exact_size_and_checksum() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("model.partial");
    std::fs::write(&path, b"abc").unwrap();
    let sha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    assert_eq!(path.metadata().unwrap().len(), 3);
    assert!(verification_events(&path, sha256).0.is_ok());
    assert!(verification_events(&path, &"0".repeat(64)).0.is_err());
}

#[test]
fn complete_artifacts_enter_verification_before_network_work() {
    let directory = tempfile::tempdir().unwrap();
    let paths = DownloadPaths::new(directory.path(), "model.gguf");

    std::fs::write(&paths.model, b"abc").unwrap();
    assert_eq!(
        download_phase(&paths, 3, false).unwrap(),
        DownloadPhase::Verifying
    );

    std::fs::remove_file(&paths.model).unwrap();
    std::fs::write(&paths.partial, b"abc").unwrap();
    assert_eq!(
        download_phase(&paths, 3, false).unwrap(),
        DownloadPhase::Verifying
    );
}

#[test]
fn resumable_partial_stays_in_the_downloading_phase() {
    let directory = tempfile::tempdir().unwrap();
    let paths = DownloadPaths::new(directory.path(), "model.gguf");
    std::fs::write(&paths.partial, b"ab").unwrap();

    assert_eq!(
        download_phase(&paths, 3, false).unwrap(),
        DownloadPhase::Downloading
    );
}

#[test]
fn recovery_failures_do_not_masquerade_as_network_download_failures() {
    assert!(!attempt_failure_event(false, false));
    assert!(attempt_failure_event(false, true));
    assert!(!attempt_failure_event(true, true));
}

#[tokio::test]
async fn stalled_response_reaches_a_terminal_timeout() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        let _connection = listener.accept().unwrap();
        std::thread::sleep(Duration::from_millis(250));
    });
    let client = download_client(Duration::from_millis(25)).unwrap();

    let error = client
        .get(format!("http://{address}"))
        .send()
        .await
        .unwrap_err();

    assert!(error.is_timeout());
}
