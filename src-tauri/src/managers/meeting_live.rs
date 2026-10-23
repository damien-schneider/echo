//! Where each source's audio goes while a meeting records: the microphone streams through Voxtral
//! on a Mac that runs it, everything else through the Whisper preview worker.

use log::{info, warn};
use std::sync::Arc;
use tauri::Manager;

use super::meeting::MeetingManager;
use super::meeting_streaming::{
    emit_events, StreamingSource, StreamingWorker, StreamingWorkerHandle,
};
use super::meeting_voxtral::SourceTranscript;
use super::meeting_voxtral_live::{VoxtralWorker, VoxtralWorkerHandle};
use super::transcription::TranscriptionManager;

#[derive(Clone)]
pub(super) enum LiveWorker {
    Whisper(Arc<StreamingWorker>),
    Voxtral(Arc<VoxtralWorker>),
}

impl LiveWorker {
    pub(super) fn push_audio(&self, source: StreamingSource, samples: Vec<f32>) {
        match self {
            LiveWorker::Whisper(worker) => worker.push_audio(source, samples),
            LiveWorker::Voxtral(worker) => worker.push_audio(samples),
        }
    }
}

pub(super) enum LiveWorkerHandle {
    Whisper(StreamingWorkerHandle),
    Voxtral(VoxtralWorkerHandle),
}

impl LiveWorkerHandle {
    /// Only a Voxtral stream leaves text worth keeping: the Whisper preview is redone at stop.
    fn stop(self) -> Option<SourceTranscript> {
        match self {
            LiveWorkerHandle::Whisper(handle) => {
                handle.stop();
                None
            }
            LiveWorkerHandle::Voxtral(handle) => Some(handle.stop()),
        }
    }
}

pub(super) struct LiveWorkers {
    pub(super) mic: Option<LiveWorker>,
    pub(super) system: Option<LiveWorker>,
}

impl MeetingManager {
    /// One Voxtral model takes 1.8 GB and serves a single stream, so the system track keeps the
    /// Whisper preview rather than load a second one.
    pub(super) fn spawn_live_workers(&self, meeting_id: i64, captures_system: bool) -> LiveWorkers {
        let voxtral = self.spawn_voxtral_mic(meeting_id);
        let whisper = if voxtral.is_none() || captures_system {
            self.spawn_whisper_preview(meeting_id)
        } else {
            None
        };
        LiveWorkers {
            mic: voxtral.or_else(|| whisper.clone()),
            system: whisper,
        }
    }

    pub(super) fn stop_live_workers(&self) -> Vec<SourceTranscript> {
        let handles = std::mem::take(&mut *self.live_handles.lock().unwrap());
        handles
            .into_iter()
            .filter_map(LiveWorkerHandle::stop)
            .collect()
    }

    fn spawn_voxtral_mic(&self, meeting_id: i64) -> Option<LiveWorker> {
        let model_path = self.voxtral_model_path()?;
        let app_handle = self.app_handle.clone();
        let emit = Box::new(move |events| {
            emit_events(&app_handle, meeting_id, StreamingSource::Mic, events);
        });
        match VoxtralWorker::spawn(meeting_id, StreamingSource::Mic, model_path, emit) {
            Ok((worker, handle)) => {
                self.keep_live_handle(LiveWorkerHandle::Voxtral(handle));
                Some(LiveWorker::Voxtral(worker))
            }
            Err(e) => {
                warn!("Failed to spawn the Voxtral worker: {e:#}");
                None
            }
        }
    }

    /// Without a model every decode fails, five times a second, for the whole meeting: the
    /// recording is what matters, and the batch pass transcribes it once the model is there.
    fn spawn_whisper_preview(&self, meeting_id: i64) -> Option<LiveWorker> {
        if !self.transcription_ready() {
            info!("Meeting {meeting_id} records without a Whisper preview: no transcription model");
            return None;
        }
        let transcription = self.app_handle.state::<Arc<TranscriptionManager>>();
        match StreamingWorker::spawn(
            self.app_handle.clone(),
            meeting_id,
            transcription.inner().clone(),
        ) {
            Ok((worker, handle)) => {
                self.keep_live_handle(LiveWorkerHandle::Whisper(handle));
                info!("Realtime streaming worker started for meeting {meeting_id}");
                Some(LiveWorker::Whisper(worker))
            }
            Err(e) => {
                warn!("Failed to spawn streaming worker: {e:#}");
                None
            }
        }
    }

    fn keep_live_handle(&self, handle: LiveWorkerHandle) {
        self.live_handles.lock().unwrap().push(handle);
    }
}
