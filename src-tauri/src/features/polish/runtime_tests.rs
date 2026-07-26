use super::*;
use crate::features::polish::policy::validate_polish_output;
#[cfg(unix)]
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
#[cfg(unix)]
use std::sync::Arc;
use std::time::Instant;
#[cfg(unix)]
use tempfile::tempdir;

#[test]
fn validated_chat_response_rejects_malformed_or_empty_payloads() {
    let valid = r#"{"choices":[{"message":{"content":"Fixed text."}}]}"#;
    assert_eq!(parse_chat_response(valid).unwrap(), "Fixed text.");
    assert!(parse_chat_response(r#"{"choices":[]}"#).is_err());
    assert!(parse_chat_response(r#"{"choices":[{"message":{"content":12}}]}"#).is_err());
    assert!(parse_chat_response("not json").is_err());
}

#[tokio::test]
async fn reset_without_a_process_returns_success() {
    let runtime = PolishRuntime::new(PolishRuntimeConfig {
        server_path: PathBuf::new(),
        working_directory: PathBuf::new(),
        model_path: PathBuf::new(),
    });

    runtime.reset().await.unwrap();
}

#[tokio::test]
async fn every_non_ready_runtime_requires_repair() {
    let runtime = PolishRuntime::new(PolishRuntimeConfig {
        server_path: PathBuf::new(),
        working_directory: PathBuf::new(),
        model_path: PathBuf::new(),
    });

    runtime.process.lock().await.state = ServerState::Stopped;
    assert!(runtime.requires_repair().await);
    runtime.process.lock().await.state = ServerState::Starting;
    assert!(runtime.requires_repair().await);
    runtime.process.lock().await.state = ServerState::Disabled;
    assert!(runtime.requires_repair().await);
    runtime.process.lock().await.state = ServerState::Ready;
    assert!(!runtime.requires_repair().await);
}

#[tokio::test]
async fn shutdown_is_idempotent_and_prevents_future_startup() {
    let runtime = PolishRuntime::new(PolishRuntimeConfig {
        server_path: PathBuf::new(),
        working_directory: PathBuf::new(),
        model_path: PathBuf::new(),
    });

    runtime.shutdown().await.unwrap();
    runtime.shutdown().await.unwrap();

    let error = runtime.ensure_ready().await.unwrap_err();
    assert!(error.to_string().contains("shutting down"));
}

#[cfg(unix)]
#[tokio::test]
async fn shutdown_interrupts_startup_and_reaps_the_child() {
    let directory = tempdir().unwrap();
    let server_path = directory.path().join("test-polish-server");
    let pid_path = directory.path().join("test-polish-server.pid");
    fs::write(
        &server_path,
        "#!/bin/sh\nprintf '%s' \"$$\" > \"$0.pid\"\nexec /bin/sleep 60\n",
    )
    .unwrap();
    let mut permissions = fs::metadata(&server_path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&server_path, permissions).unwrap();
    let runtime = Arc::new(PolishRuntime::new(PolishRuntimeConfig {
        server_path,
        working_directory: directory.path().to_path_buf(),
        model_path: directory.path().join("model.gguf"),
    }));
    let startup_runtime = Arc::clone(&runtime);
    let startup = tokio::spawn(async move { startup_runtime.ensure_ready().await });
    let pid = wait_for_child_pid(&pid_path).await;

    let started = Instant::now();
    runtime.shutdown().await.unwrap();

    assert!(started.elapsed() < Duration::from_secs(2));
    assert!(startup.await.unwrap().is_err());
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
}

#[cfg(unix)]
async fn wait_for_child_pid(path: &std::path::Path) -> i32 {
    for _ in 0..100 {
        if let Ok(value) = fs::read_to_string(path) {
            return value.parse().unwrap();
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("Polish test server did not start");
}

#[tokio::test]
#[ignore = "requires ECHO_POLISH_MODEL_PATH and ECHO_POLISH_SERVER_PATH"]
async fn multilingual_real_model_release_smoke() {
    let model_path = required_path("ECHO_POLISH_MODEL_PATH");
    let server_path = required_path("ECHO_POLISH_SERVER_PATH");
    let runtime = PolishRuntime::new(PolishRuntimeConfig {
        working_directory: server_path.parent().unwrap().to_path_buf(),
        server_path,
        model_path,
    });
    runtime.ensure_ready().await.unwrap();
    let fixtures = [
        (
            "Have you finally succeeded to take another train?",
            "Have you finally succeeded in taking another train?",
        ),
        (
            "Je suis aller à la gare hier.",
            "Je suis allé à la gare hier.",
        ),
        ("Ella a llegado temprano.", "Ella ha llegado temprano."),
        ("Das ist ein gute Idee.", "Das ist eine gute Idee."),
        ("Eu fui ao mercado ontem.", "Eu fui ao mercado ontem."),
        ("Ho mangiato una mela ieri.", "Ho mangiato una mela ieri."),
        ("Это хорошая идея.", "Это хорошая идея."),
        ("هذه فكرة جيدة.", "هذه فكرة جيدة."),
        ("यह एक अच्छा विचार है।", "यह एक अच्छा विचार है।"),
        ("这是一个好主意。", "这是一个好主意。"),
        ("これは良いアイデアです。", "これは良いアイデアです。"),
        ("이것은 좋은 생각입니다.", "이것은 좋은 생각입니다."),
    ];
    for (input, expected) in fixtures {
        let output = runtime.polish(input).await.unwrap();
        assert_eq!(output, expected);
        validate_polish_output(input, &output).unwrap();
    }
    let protected = "Email FooBar at hello@example.com about user_id and https://echo.app.";
    let protected_output = runtime.polish(protected).await.unwrap();
    validate_polish_output(protected, &protected_output).unwrap();
    let input = "This are a short sentence that need one correction.";
    let started = Instant::now();
    let _ = runtime.polish(input).await.unwrap();
    assert!(started.elapsed() < Duration::from_millis(500));
}

fn required_path(name: &str) -> PathBuf {
    let value = std::env::var(name).unwrap_or_else(|_| panic!("{name} is required"));
    let path = PathBuf::from(value);
    assert!(path.is_file(), "{name} must point to a file");
    path
}
