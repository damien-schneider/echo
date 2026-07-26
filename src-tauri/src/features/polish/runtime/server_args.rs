/// Polish runs next to whatever the user is actually doing — a build, a call, a
/// recording. Leaving llama.cpp on its default (every core) turns a two second
/// correction into a stalled machine, so it gets half the cores and no more
/// than this.
const MAX_THREADS: usize = 8;

const CONTEXT_SIZE: &str = "4096";

pub(super) struct ServerBinding<'a> {
    pub(super) model_path: &'a str,
    pub(super) port: u16,
    pub(super) api_key: &'a str,
}

pub(super) fn polish_thread_count(available: usize) -> usize {
    (available / 2).clamp(1, MAX_THREADS).min(available.max(1))
}

/// The command line the local server is started with. Loopback host and a
/// per-run key keep the model reachable only from this app.
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
        CONTEXT_SIZE,
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
