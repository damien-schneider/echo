use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::process::Stdio;

const TAIL_BYTES: u64 = 8 * 1024;
const TAIL_LINES: usize = 20;

/// llama-server explains a failed start only on stderr; a file keeps it with no reader to drain.
pub(super) fn server_output_sink(log_path: &Path) -> Stdio {
    match File::create(log_path) {
        Ok(file) => Stdio::from(file),
        Err(error) => {
            log::warn!("llama-server output will not be kept: {error}");
            Stdio::null()
        }
    }
}

pub(super) fn log_server_output(log_path: &Path) {
    if let Some(tail) = server_output_tail(log_path) {
        log::error!("llama-server stopped. Its last output:\n{tail}");
    }
}

pub(super) fn server_output_tail(log_path: &Path) -> Option<String> {
    let mut file = File::open(log_path).ok()?;
    let length = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(length.saturating_sub(TAIL_BYTES)))
        .ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    let output = String::from_utf8_lossy(&bytes);
    let lines: Vec<&str> = output.lines().collect();
    let tail = lines[lines.len().saturating_sub(TAIL_LINES)..].join("\n");
    (!tail.is_empty()).then_some(tail)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn only_the_end_of_the_server_output_reaches_the_log() {
        let directory = tempfile::tempdir().unwrap();
        let log_path = directory.path().join("llama-server.log");
        let output: Vec<String> = (1..=50).map(|line| format!("line {line}")).collect();
        fs::write(&log_path, output.join("\n")).unwrap();

        let tail = server_output_tail(&log_path).unwrap();

        assert_eq!(tail.lines().count(), TAIL_LINES);
        assert!(tail.starts_with("line 31\n"));
        assert!(tail.ends_with("line 50"));
    }

    #[test]
    fn a_server_that_wrote_nothing_adds_nothing_to_the_log() {
        let directory = tempfile::tempdir().unwrap();
        let log_path = directory.path().join("llama-server.log");

        assert_eq!(server_output_tail(&log_path), None);
        fs::write(&log_path, "").unwrap();
        assert_eq!(server_output_tail(&log_path), None);
    }
}
