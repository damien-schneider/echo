/// llama.cpp defaults to every core, which stalls the machine mid-build or mid-call.
const MAX_THREADS: usize = 8;

const CONTEXT_TOKENS: usize = 4096;

/// Every completion the sidecar serves is capped here, and the input budget is what is left over.
pub(in crate::features::polish) const MAX_RESPONSE_TOKENS: usize = 2_048;
const PROMPT_OVERHEAD_TOKENS: usize = 256;
/// Deliberately pessimistic: accented and CJK text tokenizes far worse than English.
const CHARS_PER_TOKEN: usize = 3;

/// How much transcript one local call can take before the sidecar truncates it.
pub(in crate::features::polish) fn local_input_char_budget() -> usize {
    CONTEXT_TOKENS.saturating_sub(MAX_RESPONSE_TOKENS + PROMPT_OVERHEAD_TOKENS) * CHARS_PER_TOKEN
}

pub(super) struct ServerBinding<'a> {
    pub(super) model_path: &'a str,
    pub(super) port: u16,
    pub(super) api_key: &'a str,
}

pub(super) fn polish_thread_count(available: usize) -> usize {
    (available / 2).clamp(1, MAX_THREADS).min(available.max(1))
}

/// Loopback host plus a per-run key keep the server reachable only from this app.
pub(super) fn server_arguments(binding: ServerBinding<'_>) -> Vec<String> {
    let threads = polish_thread_count(available_cores());
    [
        "--model",
        binding.model_path,
        "--host",
        "127.0.0.1",
        "--port",
        &binding.port.to_string(),
        "--ctx-size",
        &CONTEXT_TOKENS.to_string(),
        "--threads",
        &threads.to_string(),
        "--api-key",
        binding.api_key,
        "--no-webui",
        "--reasoning",
        "off",
        "--parallel",
        "1",
    ]
    .map(str::to_string)
    .to_vec()
}

fn available_cores() -> usize {
    std::thread::available_parallelism()
        .map(std::num::NonZeroUsize::get)
        .unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A chunk sized past this makes llama.cpp drop the head of the transcript without saying so.
    #[test]
    fn the_input_budget_leaves_room_for_the_answer_inside_the_context() {
        let budget_tokens = local_input_char_budget() / CHARS_PER_TOKEN;

        assert!(budget_tokens + MAX_RESPONSE_TOKENS < CONTEXT_TOKENS);
        assert!(local_input_char_budget() > 0);
    }

    #[test]
    fn a_correction_leaves_half_the_machine_to_the_user() {
        assert_eq!(polish_thread_count(10), 5);
        assert_eq!(polish_thread_count(4), 2);
    }

    #[test]
    fn a_large_machine_is_not_taken_over_by_a_proofreader() {
        assert_eq!(polish_thread_count(32), MAX_THREADS);
        assert_eq!(polish_thread_count(128), MAX_THREADS);
    }

    #[test]
    fn a_small_machine_still_gets_a_worker_it_owns() {
        assert_eq!(polish_thread_count(1), 1);
        assert_eq!(polish_thread_count(2), 1);
        assert_eq!(polish_thread_count(0), 1);
    }

    #[test]
    fn the_server_only_listens_on_loopback_behind_a_key() {
        let arguments = server_arguments(ServerBinding {
            model_path: "/models/polish.gguf",
            port: 51_234,
            api_key: "secret",
        });

        assert!(arguments
            .windows(2)
            .any(|pair| pair == ["--host".to_string(), "127.0.0.1".to_string()]));
        assert!(arguments
            .windows(2)
            .any(|pair| pair == ["--port".to_string(), "51234".to_string()]));
        assert!(arguments
            .windows(2)
            .any(|pair| pair == ["--api-key".to_string(), "secret".to_string()]));
        assert!(arguments.contains(&"--no-webui".to_string()));
    }

    #[test]
    fn the_thread_budget_reaches_the_server() {
        let arguments = server_arguments(ServerBinding {
            model_path: "/models/polish.gguf",
            port: 1,
            api_key: "key",
        });
        let threads = arguments
            .iter()
            .position(|argument| argument == "--threads")
            .and_then(|index| arguments.get(index + 1))
            .expect("the server is told how many threads it may use");

        assert_eq!(threads, &polish_thread_count(available_cores()).to_string());
    }
}
