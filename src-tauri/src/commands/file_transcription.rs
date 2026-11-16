use crate::audio_toolkit::{audio::decode_audio_file, constants::SAMPLE_RATE};
use crate::managers::history::HistoryManager;
use crate::managers::transcription::{
    transcription_timeout, try_acquire_once_flag, OnceFlagGuard, TranscriptionManager,
};
use log::{error, info};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const INDETERMINATE_PROGRESS: f64 = -1.0;
const MODEL_LOAD_HEADSTART: Duration = Duration::from_millis(500);
const ELAPSED_UPDATE_INTERVAL: Duration = Duration::from_secs(5);
const JOB_ALREADY_RUNNING: &str =
    "Another file is still being transcribed. Wait for it to finish, then try again.";

static NEXT_JOB_ID: AtomicU64 = AtomicU64::new(1);

struct JobClaim<'a> {
    id: u64,
    _running: OnceFlagGuard<'a>,
}

fn claim_job(running: &AtomicBool) -> Option<JobClaim<'_>> {
    let guard = try_acquire_once_flag(running)?;
    Some(JobClaim {
        id: NEXT_JOB_ID.fetch_add(1, Ordering::SeqCst),
        _running: guard,
    })
}

#[derive(Clone)]
struct Job {
    app: AppHandle,
    id: u64,
    file_name: Option<String>,
}

impl Job {
    fn emit(&self, event: &str, payload: Value) {
        if let Err(e) = self.app.emit(event, payload) {
            error!("Failed to emit {event} event: {e}");
        }
    }

    fn progress(&self, status: &str, progress: f64, message: &str) {
        self.emit(
            "file-transcription-progress",
            json!({
                "jobId": self.id,
                "status": status,
                "progress": progress,
                "message": message,
                "fileName": self.file_name,
            }),
        );
    }

    fn failed(&self, message: &str) {
        self.emit(
            "file-transcription-error",
            json!({
                "jobId": self.id,
                "message": message,
                "fileName": self.file_name,
            }),
        );
    }

    fn completed(&self, text: &str, warning: Option<&str>) {
        self.emit(
            "transcription-complete",
            json!({
                "jobId": self.id,
                "text": text,
                "fileName": self.file_name.as_deref().unwrap_or("Unknown file"),
                "warning": warning,
            }),
        );
    }
}

fn show_dialog(app: &AppHandle, title: &str, message: &str) {
    let payload = json!({ "title": title, "message": message });
    if let Err(e) = app.emit("show-error-dialog", payload) {
        error!("Failed to emit show-error-dialog event: {e}");
    }
}

fn skipped_files_notice(paths: &[PathBuf]) -> Option<String> {
    let [first, _, ..] = paths else {
        return None;
    };
    let name = first.file_name().unwrap_or(first.as_os_str());
    Some(format!(
        "Only {} will be transcribed. Drop the other files one at a time once it finishes.",
        name.to_string_lossy()
    ))
}

pub(crate) fn first_dropped_file(app: &AppHandle, paths: &[PathBuf]) -> Option<PathBuf> {
    let first = paths.first()?;
    if let Some(notice) = skipped_files_notice(paths) {
        show_dialog(app, "One File at a Time", &notice);
    }
    Some(first.clone())
}

pub(crate) async fn transcribe_audio_file(app: AppHandle, path: PathBuf) -> Result<(), String> {
    let Some(claim) = claim_job(&crate::FILE_TRANSCRIPTION_ACTIVE) else {
        show_dialog(&app, "Transcription in Progress", JOB_ALREADY_RUNNING);
        return Err(JOB_ALREADY_RUNNING.to_string());
    };
    let job = Job {
        app,
        id: claim.id,
        file_name: path
            .file_name()
            .and_then(|n| n.to_str())
            .map(ToString::to_string),
    };

    let outcome = run_job(&job, &path).await;
    if let Err(message) = &outcome {
        job.failed(message);
    }
    outcome
}

async fn run_job(job: &Job, path: &Path) -> Result<(), String> {
    let audio_samples = decode(job, path)?;
    let text = transcribe(job, &audio_samples)?;

    job.progress("saving", 0.9, "Saving to history...");

    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Uploaded File");
    let title = format!("File: {}", file_stem);

    let history_manager = job.app.state::<Arc<HistoryManager>>();
    let warning = history_manager
        .save_transcription(audio_samples, text.clone(), None, None)
        .await
        .and_then(|entry_id| history_manager.rename_entry(entry_id, &title))
        .err()
        .map(|e| format!("Transcribed, but the transcript was not saved to history: {e:#}"));
    if let Some(warning) = &warning {
        error!("{warning}");
    }

    job.completed(&text, warning.as_deref());

    info!(
        "Successfully transcribed audio file: {} ({} characters)",
        path.display(),
        text.len()
    );
    Ok(())
}

fn is_video_file(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    matches!(
        extension.as_str(),
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv"
    )
}

/// 16 kHz mono f32
fn decode(job: &Job, path: &Path) -> Result<Vec<f32>, String> {
    if !path.exists() {
        return Err(format!("File not found: {}", path.display()));
    }

    let is_video = is_video_file(path);
    let message = if is_video {
        "Extracting audio from video..."
    } else {
        "Loading audio file..."
    };
    job.progress("decoding", 0.0, message);

    let audio_samples = decode_audio_file(path).map_err(|e| {
        if is_video {
            format!(
                "Failed to extract audio: {}. Make sure FFmpeg is installed.",
                e
            )
        } else {
            format!("Failed to decode audio: {}", e)
        }
    })?;

    if audio_samples.is_empty() {
        return Err("Audio file contains no audible content".to_string());
    }
    Ok(audio_samples)
}

fn format_duration(total_secs: u64) -> String {
    if total_secs >= 60 {
        format!("{}m {}s", total_secs / 60, total_secs % 60)
    } else {
        format!("{}s", total_secs)
    }
}

fn transcribe(job: &Job, audio_samples: &[f32]) -> Result<String, String> {
    let transcription_manager = job.app.state::<Arc<TranscriptionManager>>();
    let headline = format!(
        "Transcribing {} of audio...",
        format_duration((audio_samples.len() / SAMPLE_RATE) as u64)
    );
    job.progress("transcribing", INDETERMINATE_PROGRESS, &headline);

    transcription_manager.initiate_model_load();
    std::thread::sleep(MODEL_LOAD_HEADSTART);

    let finished = Arc::new(AtomicBool::new(false));
    let ticker = spawn_elapsed_ticker(job.clone(), headline, finished.clone());

    // uncapped, a hung whisper FFI keeps the job claimed and blocks dictation and other files forever
    let result = transcription_manager.transcribe_with_timeout(
        audio_samples.to_vec(),
        transcription_timeout(audio_samples.len()),
    );

    finished.store(true, Ordering::SeqCst);
    let _ = ticker.join();

    let text = result.map_err(|e| format!("Transcription failed: {}", e))?;
    if text.trim().is_empty() {
        return Err("No speech detected in the audio".to_string());
    }
    Ok(text)
}

fn spawn_elapsed_ticker(job: Job, headline: String, finished: Arc<AtomicBool>) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let start_time = Instant::now();
        std::thread::sleep(ELAPSED_UPDATE_INTERVAL);

        while !finished.load(Ordering::SeqCst) {
            let message = format!(
                "{} ({} elapsed)",
                headline,
                format_duration(start_time.elapsed().as_secs())
            );
            job.progress("transcribing", INDETERMINATE_PROGRESS, &message);
            std::thread::sleep(ELAPSED_UPDATE_INTERVAL);
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{claim_job, skipped_files_notice};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn a_second_file_is_refused_while_one_is_being_transcribed() {
        let running = AtomicBool::new(false);
        let _first = claim_job(&running);

        assert!(claim_job(&running).is_none());
    }

    #[test]
    fn a_refused_file_leaves_the_running_job_in_place() {
        let running = AtomicBool::new(false);
        let _first = claim_job(&running);

        drop(claim_job(&running));

        assert!(claim_job(&running).is_none());
    }

    #[test]
    fn a_file_can_be_transcribed_once_the_previous_job_has_ended() {
        let running = AtomicBool::new(false);
        drop(claim_job(&running));

        assert!(claim_job(&running).is_some());
    }

    #[test]
    fn dictation_sees_a_file_job_only_while_it_runs() {
        let running = AtomicBool::new(false);

        let job = claim_job(&running);
        assert!(running.load(Ordering::SeqCst));

        drop(job);
        assert!(!running.load(Ordering::SeqCst));
    }

    #[test]
    fn consecutive_jobs_never_share_an_identity() {
        let running = AtomicBool::new(false);
        let first = claim_job(&running).map(|job| job.id);
        let second = claim_job(&running).map(|job| job.id);

        assert!(first.is_some());
        assert!(second.is_some());
        assert_ne!(first, second);
    }

    #[test]
    fn dropping_one_file_raises_no_notice() {
        assert_eq!(skipped_files_notice(&[PathBuf::from("/tmp/a.mp3")]), None);
    }

    #[test]
    fn dropping_several_files_says_only_the_first_is_transcribed() {
        let dropped = [PathBuf::from("/tmp/a.mp3"), PathBuf::from("/tmp/b.mp3")];

        let notice = skipped_files_notice(&dropped).unwrap_or_default();

        assert!(notice.contains("a.mp3"));
        assert!(!notice.contains("b.mp3"));
    }
}
