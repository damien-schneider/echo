//! Where each source's audio goes while a meeting records: a source streams through its own
//! Voxtral model where the Mac runs one for it, everything else through the Whisper preview worker.

use log::{info, warn};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

use super::audio::load_speech_vad;
use super::meeting::MeetingManager;
use super::meeting_streaming::{
    emit_events, StreamingSource, StreamingWorker, StreamingWorkerHandle,
};
use super::meeting_voxtral::{live_engine, physical_memory_bytes, LiveEngine, SourceTranscript};
use super::meeting_voxtral_live::{LiveSource, VoxtralWorker, VoxtralWorkerHandle};
use super::transcription::TranscriptionManager;
use crate::audio_toolkit::vad::SpeechFrames;

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
    pub(super) fn spawn_live_workers(&self, meeting_id: i64, captures_system: bool) -> LiveWorkers {
        let voxtral_model = self.voxtral_model_path();
        let memory_bytes = physical_memory_bytes();
        let voxtral_for = |source: StreamingSource| -> Option<LiveWorker> {
            if live_engine(source, voxtral_model.is_some(), memory_bytes) != LiveEngine::Voxtral {
                return None;
            }
            self.spawn_voxtral(meeting_id, source, voxtral_model.clone()?)
        };
        let mic = voxtral_for(StreamingSource::Mic);
        let system = captures_system
            .then(|| voxtral_for(StreamingSource::System))
            .flatten();
        let needs_whisper = mic.is_none() || (captures_system && system.is_none());
        let whisper = needs_whisper
            .then(|| self.spawn_whisper_preview(meeting_id))
            .flatten();
        LiveWorkers {
            mic: mic.or_else(|| whisper.clone()),
            system: system.or(whisper.filter(|_| captures_system)),
        }
    }

    pub(super) fn stop_live_workers(&self) -> Vec<SourceTranscript> {
        let handles = std::mem::take(&mut *self.live_handles.lock().unwrap());
        handles
            .into_iter()
            .filter_map(LiveWorkerHandle::stop)
            .collect()
    }

    fn spawn_voxtral(
        &self,
        meeting_id: i64,
        source: StreamingSource,
        model_path: PathBuf,
    ) -> Option<LiveWorker> {
        let app_handle = self.app_handle.clone();
        let speech = load_speech_vad(&self.app_handle)
            .inspect_err(|e| warn!("Voxtral live lines close without pause detection: {e:#}"))
            .ok()
            .map(|vad| SpeechFrames::new(Box::new(vad)));
        let live = LiveSource {
            meeting_id,
            source,
            model_path,
            emit: Box::new(move |events| emit_events(&app_handle, meeting_id, source, events)),
            speech,
        };
        match VoxtralWorker::spawn(live) {
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
                warn!("Meeting {meeting_id} records without a Whisper preview: {e:#}");
                None
            }
        }
    }

    fn keep_live_handle(&self, handle: LiveWorkerHandle) {
        self.live_handles.lock().unwrap().push(handle);
    }
}
