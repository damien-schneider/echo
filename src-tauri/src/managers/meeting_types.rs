//! The shapes a meeting is stored, exported and streamed in.

use serde::{Deserialize, Serialize};

pub(super) const SAMPLE_RATE: usize = 16_000;

pub(super) fn ms_to_samples(ms: i64) -> usize {
    usize::try_from(ms.max(0)).unwrap_or(0) * SAMPLE_RATE / 1000
}

pub(super) fn samples_to_ms(samples: usize) -> i64 {
    i64::try_from(samples * 1000 / SAMPLE_RATE).unwrap_or(i64::MAX)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MeetingStatus {
    Recording,
    Processing,
    /// Audio saved without a transcript: the models were still missing when the meeting stopped.
    Recorded,
    Complete,
    /// Some of the recording was transcribed and some was lost: there is text to read and a
    /// retranscribe worth running.
    Partial,
    Error,
}

impl MeetingStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            MeetingStatus::Recording => "recording",
            MeetingStatus::Processing => "processing",
            MeetingStatus::Recorded => "recorded",
            MeetingStatus::Complete => "complete",
            MeetingStatus::Partial => "partial",
            MeetingStatus::Error => "error",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "recording" => MeetingStatus::Recording,
            "processing" => MeetingStatus::Processing,
            "recorded" => MeetingStatus::Recorded,
            "complete" => MeetingStatus::Complete,
            "partial" => MeetingStatus::Partial,
            "error" => MeetingStatus::Error,
            _ => MeetingStatus::Error,
        }
    }
}

/// What is running right now, readable at any moment — a window that opens mid-meeting must not
/// depend on having seen the start event.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ActiveMeeting {
    Recording { meeting_id: i64, start_time: i64 },
    Processing,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    Mic,
    System,
}

impl AudioSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            AudioSource::Mic => "mic",
            AudioSource::System => "system",
        }
    }
}

/// Why a source stopped recording: the two need different advice, so they reach the user as
/// different sentences.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AudioWarningReason {
    /// The capture stopped delivering samples — unplugged device, revoked permission, a stall.
    Device,
    /// The samples arrive but no longer reach the disk — a full volume, a deleted file.
    Write,
}

#[derive(Debug, Clone, Serialize)]
pub struct MeetingAudioWarning {
    pub source: AudioSource,
    pub reason: AudioWarningReason,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub id: i64,
    pub title: String,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub duration_ms: Option<i64>,
    pub mic_file_name: Option<String>,
    pub system_file_name: Option<String>,
    pub summary: Option<String>,
    pub status: MeetingStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSegment {
    pub id: i64,
    pub meeting_id: i64,
    pub speaker_label: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
    pub confidence: Option<f64>,
    pub audio_source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchPhase {
    Transcribing,
    /// Sortformer pass on full WAV before per-segment decode.
    Diarizing,
    Done,
}

#[derive(Debug, Clone, Serialize)]
pub struct MeetingBatchProgress {
    pub meeting_id: i64,
    pub source: String,
    pub phase: BatchPhase,
    pub chunks_done: usize,
    pub chunks_total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Srt,
    Vtt,
    Txt,
    Markdown,
}

pub fn format_ms_to_hms(ms: i64) -> String {
    let total_secs = ms / 1000;
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

pub fn format_ms_to_srt_time(ms: i64) -> String {
    let total_secs = ms / 1000;
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    let millis = ms % 1000;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, millis)
}

pub fn format_ms_to_vtt_time(ms: i64) -> String {
    let total_secs = ms / 1000;
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    let millis = ms % 1000;
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, millis)
}

include!("meeting_types_tests.rs");
