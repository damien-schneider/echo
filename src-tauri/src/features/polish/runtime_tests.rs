use super::*;
use crate::features::polish::policy::validate_polish_output;
use crate::features::polish::transform::{transform_request, Framing};
use crate::settings::{Instruction, PolishLevel};
#[cfg(unix)]
use std::fs;
#[cfg(unix)]
use std::io::{BufRead, BufReader, Write};
#[cfg(unix)]
use std::net::TcpListener;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
#[cfg(unix)]
use std::path::Path;
#[cfg(unix)]
use std::sync::Arc;
#[cfg(unix)]
use std::thread;
use std::time::Instant;
#[cfg(unix)]
use tempfile::tempdir;

fn runtime_without_a_server() -> PolishRuntime {
    PolishRuntime::new(PolishRuntimeConfig {
        server_path: PathBuf::new(),
        working_directory: PathBuf::new(),
        model_path: PathBuf::new(),
        server_record: PathBuf::new(),
        server_log: PathBuf::new(),
    })
}

#[test]
fn validated_chat_response_rejects_malformed_or_empty_payloads() {
    let valid = r#"{"choices":[{"message":{"content":"Fixed text."}}]}"#;
    assert_eq!(parse_chat_response(valid).unwrap(), "Fixed text.");
    assert!(parse_chat_response(r#"{"choices":[]}"#).is_err());
    assert!(parse_chat_response(r#"{"choices":[{"message":{"content":12}}]}"#).is_err());
    assert!(parse_chat_response("not json").is_err());
}

#[test]
fn bundled_chat_serializes_the_frontend_conversation() {
    let messages: Vec<crate::features::polish::BundledChatMessage> =
        serde_json::from_value(serde_json::json!([
            { "content": "What does this mean?", "role": "user" },
            { "content": "It means…", "role": "assistant" }
        ]))
        .unwrap();
    let request_messages = bundled_chat_request_messages("Echo system", &messages);
    let request = ChatRequest {
        model: "polish",
        messages: &request_messages,
        stream: false,
        temperature: 0.2,
        seed: 0,
        max_tokens: 2_048,
    };
    let serialized = serde_json::to_value(request).unwrap();

    assert_eq!(
        serialized["messages"],
        serde_json::json!([
            { "content": "Echo system", "role": "system" },
            { "content": "What does this mean?", "role": "user" },
            { "content": "It means…", "role": "assistant" }
        ])
    );
}

#[tokio::test]
async fn reset_without_a_process_returns_success() {
    let runtime = runtime_without_a_server();

    runtime.reset().await.unwrap();
}

#[tokio::test]
async fn every_non_ready_runtime_requires_repair() {
    let runtime = runtime_without_a_server();

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
    let runtime = runtime_without_a_server();

    runtime.shutdown().await.unwrap();
    runtime.shutdown().await.unwrap();

    let error = runtime.ensure_ready().await.unwrap_err();
    assert!(error.to_string().contains("shutting down"));
}

#[cfg(unix)]
#[tokio::test]
async fn shutdown_interrupts_startup_and_reaps_the_child() {
    let directory = tempdir().unwrap();
    let runtime = runtime_with_silent_server(directory.path());
    let startup_runtime = Arc::clone(&runtime);
    let startup = tokio::spawn(async move { startup_runtime.ensure_ready().await });
    let pid = wait_for_server_pid(directory.path()).await;

    let started = Instant::now();
    runtime.shutdown().await.unwrap();

    assert!(started.elapsed() < Duration::from_secs(2));
    assert!(startup.await.unwrap().is_err());
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
}

#[cfg(unix)]
#[tokio::test]
async fn a_start_abandoned_mid_wait_is_finished_by_the_next_caller() {
    let directory = tempdir().unwrap();
    let runtime = runtime_with_silent_server(directory.path());
    let pid = abandon_startup(&runtime, directory.path()).await;
    let port = runtime.process.lock().await.port;
    let health_check = answer_one_health_check(port);

    runtime.ensure_ready().await.unwrap();

    health_check.join().unwrap();
    let process = runtime.process.lock().await;
    assert_eq!(process.state, ServerState::Ready);
    assert_eq!(
        process.child.as_ref().and_then(|child| child.id()),
        u32::try_from(pid).ok()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn an_abandoned_start_past_its_deadline_is_stopped_instead_of_awaited_again() {
    let directory = tempdir().unwrap();
    let runtime = runtime_with_silent_server(directory.path());
    let pid = abandon_startup(&runtime, directory.path()).await;
    runtime.process.lock().await.startup_deadline = tokio::time::Instant::now();

    let error = runtime.ensure_ready().await.unwrap_err();

    assert!(error.to_string().contains("did not become ready"));
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
    assert_eq!(runtime.process.lock().await.state, ServerState::Stopped);
}

#[cfg(unix)]
#[tokio::test]
async fn a_server_that_dies_while_starting_leaves_its_explanation_behind() {
    let directory = tempdir().unwrap();
    let server_log = directory.path().join("llama-server.log");
    let runtime = PolishRuntime::new(PolishRuntimeConfig {
        server_path: test_server(
            directory.path(),
            "#!/bin/sh\necho 'model file is truncated' >&2\nexit 1\n",
        ),
        working_directory: directory.path().to_path_buf(),
        model_path: directory.path().join("model.gguf"),
        server_record: PathBuf::new(),
        server_log: server_log.clone(),
    });

    let error = runtime.ensure_ready().await.unwrap_err();

    assert!(error.to_string().contains("exited during startup"));
    assert_eq!(
        server_log::server_output_tail(&server_log).as_deref(),
        Some("model file is truncated")
    );
}

#[cfg(unix)]
fn test_server(directory: &Path, script: &str) -> PathBuf {
    let server_path = directory.join("test-polish-server");
    fs::write(&server_path, script).unwrap();
    let mut permissions = fs::metadata(&server_path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&server_path, permissions).unwrap();
    server_path
}

#[cfg(unix)]
fn runtime_with_silent_server(directory: &Path) -> Arc<PolishRuntime> {
    Arc::new(PolishRuntime::new(PolishRuntimeConfig {
        server_path: test_server(
            directory,
            "#!/bin/sh\nprintf '%s' \"$$\" > \"$0.pid\"\nexec /bin/sleep 60\n",
        ),
        working_directory: directory.to_path_buf(),
        model_path: directory.join("model.gguf"),
        server_record: PathBuf::new(),
        server_log: PathBuf::new(),
    }))
}

#[cfg(unix)]
async fn wait_for_server_pid(directory: &Path) -> i32 {
    let pid_path = directory.join("test-polish-server.pid");
    for _ in 0..100 {
        let pid = fs::read_to_string(&pid_path)
            .ok()
            .and_then(|value| value.parse().ok());
        if let Some(pid) = pid {
            return pid;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("Polish test server did not start");
}

#[cfg(unix)]
async fn abandon_startup(runtime: &Arc<PolishRuntime>, directory: &Path) -> i32 {
    let startup_runtime = Arc::clone(runtime);
    let startup = tokio::spawn(async move { startup_runtime.ensure_ready().await });
    let pid = wait_for_server_pid(directory).await;
    startup.abort();
    assert!(startup.await.unwrap_err().is_cancelled());
    pid
}

#[cfg(unix)]
fn answer_one_health_check(port: u16) -> thread::JoinHandle<()> {
    let listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        for header in BufReader::new(&stream).lines() {
            if header.unwrap().is_empty() {
                break;
            }
        }
        stream
            .write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n")
            .unwrap();
    })
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
        server_record: PathBuf::new(),
        server_log: PathBuf::new(),
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
        let output = polish_naturally(&runtime, input).await;
        assert_eq!(output, expected);
        validate_polish_output(input, &output).unwrap();
    }
    let protected = "Email FooBar at hello@example.com about user_id and https://echo.app.";
    let protected_output = polish_naturally(&runtime, protected).await;
    validate_polish_output(protected, &protected_output).unwrap();
    let input = "This are a short sentence that need one correction.";
    let started = Instant::now();
    let _ = polish_naturally(&runtime, input).await;
    assert!(started.elapsed() < Duration::from_millis(500));
}

async fn polish_naturally(runtime: &PolishRuntime, text: &str) -> String {
    let natural = Instruction::Builtin(PolishLevel::Natural);
    runtime
        .complete(&transform_request(text, &natural, Framing::Selection))
        .await
        .unwrap()
}

fn required_path(name: &str) -> PathBuf {
    let value = std::env::var(name).unwrap_or_else(|_| panic!("{name} is required"));
    let path = PathBuf::from(value);
    assert!(path.is_file(), "{name} must point to a file");
    path
}
