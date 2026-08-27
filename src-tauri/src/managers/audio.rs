use crate::audio_toolkit::{
    list_input_devices, vad::SmoothedVad, AudioRecorder, CapturedAudioFrame, SelectedDeviceCache,
    SileroVad,
};
use crate::helpers::clamshell;
use crate::managers::dictation_streaming::{DictationStreamingHandle, DictationStreamingWorker};
use crate::managers::signals::RecordingActiveSignal;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, AppSettings};
use crate::utils;
use anyhow::Context;
use log::{debug, info, warn};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::Manager;

fn set_mute(mute: bool) {
    #[cfg(target_os = "windows")]
    {
        unsafe {
            use windows::Win32::{
                Media::Audio::{
                    eMultimedia, eRender, Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator,
                    MMDeviceEnumerator,
                },
                System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
            };

            macro_rules! unwrap_or_return {
                ($expr:expr) => {
                    match $expr {
                        Ok(val) => val,
                        Err(_) => return,
                    }
                };
            }

            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let all_devices: IMMDeviceEnumerator =
                unwrap_or_return!(CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL));
            let default_device =
                unwrap_or_return!(all_devices.GetDefaultAudioEndpoint(eRender, eMultimedia));
            let volume_interface = unwrap_or_return!(
                default_device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
            );

            let _ = volume_interface.SetMute(mute, std::ptr::null());
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        let mute_val = if mute { "1" } else { "0" };
        let amixer_state = if mute { "mute" } else { "unmute" };

        if Command::new("wpctl")
            .args(["set-mute", "@DEFAULT_AUDIO_SINK@", mute_val])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return;
        }

        if Command::new("pactl")
            .args(["set-sink-mute", "@DEFAULT_SINK@", mute_val])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return;
        }

        let _ = Command::new("amixer")
            .args(["set", "Master", amixer_state])
            .output();
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let script = format!(
            "set volume output muted {}",
            if mute { "true" } else { "false" }
        );
        let _ = Command::new("osascript").args(["-e", &script]).output();
    }
}

const WHISPER_SAMPLE_RATE: usize = 16000;

/* ──────────────────────────────────────────────────────────────── */

/// A panic anywhere in the audio threads must not wedge recording for the rest of the session:
/// every lock below guards a plain flag or handle that is consistent whenever a guard is taken.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct RecordingAttempt(u64);

impl RecordingAttempt {
    pub(crate) fn operation_generation(self) -> u64 {
        self.0
    }
}

#[derive(Clone, Debug)]
enum RecordingState {
    Idle,
    Starting {
        attempt: RecordingAttempt,
        binding_id: String,
    },
    Recording {
        attempt: RecordingAttempt,
        binding_id: String,
    },
    Stopping {
        attempt: RecordingAttempt,
        binding_id: String,
    },
    Finalizing {
        attempt: RecordingAttempt,
        binding_id: String,
    },
}

fn recording_binding_id(state: &RecordingState) -> Option<&str> {
    match state {
        RecordingState::Idle => None,
        RecordingState::Starting { binding_id, .. }
        | RecordingState::Recording { binding_id, .. }
        | RecordingState::Stopping { binding_id, .. }
        | RecordingState::Finalizing { binding_id, .. } => Some(binding_id),
    }
}

fn reserve_recording_start(
    state: &mut RecordingState,
    binding_id: &str,
    attempt: RecordingAttempt,
) -> bool {
    if !matches!(state, RecordingState::Idle) {
        return false;
    }
    *state = RecordingState::Starting {
        attempt,
        binding_id: binding_id.to_string(),
    };
    true
}

fn is_reserved_recording(
    state: &RecordingState,
    binding_id: &str,
    attempt: RecordingAttempt,
) -> bool {
    matches!(
        state,
        RecordingState::Starting {
            attempt: active_attempt,
            binding_id: active
        } if active == binding_id && *active_attempt == attempt
    )
}

fn is_active_recording(state: &RecordingState, attempt: RecordingAttempt) -> bool {
    matches!(state, RecordingState::Recording { attempt: active, .. } if *active == attempt)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RecordingStop {
    Active { attempt: RecordingAttempt },
    Pending { attempt: RecordingAttempt },
}

fn claim_recording_stop(state: &mut RecordingState, binding_id: &str) -> Option<RecordingStop> {
    match state {
        RecordingState::Starting {
            attempt,
            binding_id: active,
        } if active == binding_id => {
            let attempt = *attempt;
            *state = RecordingState::Stopping {
                attempt,
                binding_id: binding_id.to_string(),
            };
            Some(RecordingStop::Pending { attempt })
        }
        RecordingState::Recording {
            attempt,
            binding_id: active,
        } if active == binding_id => {
            let attempt = *attempt;
            *state = RecordingState::Stopping {
                attempt,
                binding_id: binding_id.to_string(),
            };
            Some(RecordingStop::Active { attempt })
        }
        _ => None,
    }
}

fn begin_recording_teardown(
    state: &mut RecordingState,
    binding_id: &str,
    attempt: RecordingAttempt,
) -> bool {
    if !matches!(
        state,
        RecordingState::Stopping {
            attempt: active_attempt,
            binding_id: active
        } if active == binding_id && *active_attempt == attempt
    ) {
        return false;
    }
    *state = RecordingState::Finalizing {
        attempt,
        binding_id: binding_id.to_string(),
    };
    true
}

fn finish_recording_teardown(state: &mut RecordingState, attempt: RecordingAttempt) {
    if matches!(state, RecordingState::Finalizing { attempt: active, .. } if *active == attempt) {
        *state = RecordingState::Idle;
    }
}

fn claim_recording_cancel(state: &mut RecordingState) -> Option<RecordingAttempt> {
    match state {
        RecordingState::Starting { .. } => {
            *state = RecordingState::Idle;
            None
        }
        RecordingState::Recording {
            attempt,
            binding_id,
        }
        | RecordingState::Stopping {
            attempt,
            binding_id,
        } => {
            let attempt = *attempt;
            let binding_id = binding_id.clone();
            *state = RecordingState::Finalizing {
                attempt,
                binding_id,
            };
            Some(attempt)
        }
        RecordingState::Idle | RecordingState::Finalizing { .. } => None,
    }
}

#[derive(Clone, Debug)]
pub enum MicrophoneMode {
    AlwaysOn,
    OnDemand,
}

pub struct RecordedDictation {
    pub had_long_pause: bool,
    pub samples: Vec<f32>,
    pub streaming_transcript: Option<String>,
}

struct ActiveDictationStreaming {
    handle: DictationStreamingHandle,
    forwarder: std::thread::JoinHandle<()>,
}

struct PreparedDictationStream {
    chunk_tx: Option<std::sync::mpsc::Sender<CapturedAudioFrame>>,
    session: Option<ActiveDictationStreaming>,
}

struct ReservedRecordingStart {
    attempt: RecordingAttempt,
    binding_id: String,
    stream: PreparedDictationStream,
}

impl ActiveDictationStreaming {
    fn finish(self) -> Option<String> {
        let Self { handle, forwarder } = self;
        if let Err(error) = forwarder.join() {
            log::error!("Dictation forwarder panicked: {error:?}");
            handle.stop();
            return None;
        }
        match handle.finish() {
            Ok(transcript) => Some(transcript),
            Err(error) => {
                log::error!("Failed to finish dictation streaming: {error:#}");
                None
            }
        }
    }

    fn cancel(self) {
        self.handle.stop();
    }
}

impl PreparedDictationStream {
    fn without_preview() -> Self {
        Self {
            chunk_tx: None,
            session: None,
        }
    }

    fn cancel(self) {
        drop(self.chunk_tx);
        if let Some(session) = self.session {
            session.cancel();
        }
    }
}

/* ──────────────────────────────────────────────────────────────── */

fn create_audio_recorder(
    vad_path: &str,
    app_handle: &tauri::AppHandle,
) -> Result<AudioRecorder, anyhow::Error> {
    let silero = SileroVad::new(vad_path, 0.3)
        .map_err(|e| anyhow::anyhow!("Failed to create SileroVad: {}", e))?;
    let smoothed_vad = SmoothedVad::new(Box::new(silero), 15, 15, 2);

    let recorder = AudioRecorder::new()
        .map_err(|e| anyhow::anyhow!("Failed to create AudioRecorder: {}", e))?
        .with_vad(Box::new(smoothed_vad))
        .with_level_callback({
            let app_handle = app_handle.clone();
            move |levels| {
                utils::emit_levels(&app_handle, &levels);
            }
        })
        .with_silence_callback({
            let app_handle = app_handle.clone();
            move || {
                warn!("Dictation heard only digital silence — microphone blocked or muted");
                crate::overlay::show_warning_overlay(
                    &app_handle,
                    "No sound detected — check mic access",
                );
            }
        });

    Ok(recorder)
}

/* ──────────────────────────────────────────────────────────────── */

#[derive(Clone)]
pub struct AudioRecordingManager {
    state: Arc<Mutex<RecordingState>>,
    mode: Arc<Mutex<MicrophoneMode>>,
    app_handle: tauri::AppHandle,

    recorder: Arc<Mutex<Option<AudioRecorder>>>,
    selected_device_cache: SelectedDeviceCache<cpal::Device>,
    is_open: Arc<Mutex<bool>>,
    is_recording: Arc<Mutex<bool>>,
    /// Lock-free mirror of `is_recording` — idle watcher polls it from another thread.
    recording_signal: RecordingActiveSignal,
    did_mute: Arc<Mutex<bool>>,
    dictation_streaming: Arc<Mutex<Option<ActiveDictationStreaming>>>,
}

impl AudioRecordingManager {
    /* ---------- construction ------------------------------------------------ */

    pub fn new(app: &tauri::AppHandle) -> Result<Self, anyhow::Error> {
        let settings = get_settings(app);
        let mode = if settings.always_on_microphone {
            MicrophoneMode::AlwaysOn
        } else {
            MicrophoneMode::OnDemand
        };

        let manager = Self {
            state: Arc::new(Mutex::new(RecordingState::Idle)),
            mode: Arc::new(Mutex::new(mode.clone())),
            app_handle: app.clone(),

            recorder: Arc::new(Mutex::new(None)),
            selected_device_cache: SelectedDeviceCache::default(),
            is_open: Arc::new(Mutex::new(false)),
            is_recording: Arc::new(Mutex::new(false)),
            recording_signal: RecordingActiveSignal::new(),
            did_mute: Arc::new(Mutex::new(false)),
            dictation_streaming: Arc::new(Mutex::new(None)),
        };

        if matches!(mode, MicrophoneMode::AlwaysOn) {
            manager.start_microphone_stream()?;
        } else {
            // preload VAD off-thread — first record would otherwise freeze
            let manager_clone = manager.clone();
            std::thread::spawn(move || {
                if let Err(e) = manager_clone.preload_recorder() {
                    log::warn!("Failed to preload audio recorder: {}", e);
                }
            });
        }

        Ok(manager)
    }

    pub fn recording_signal_handle(&self) -> RecordingActiveSignal {
        self.recording_signal.clone()
    }

    pub fn active_binding_id(&self) -> Option<String> {
        recording_binding_id(&lock(&self.state)).map(str::to_owned)
    }

    pub(crate) fn reserve_start(
        &self,
        binding_id: &str,
        begin_operation: impl FnOnce() -> u64,
    ) -> Option<RecordingAttempt> {
        let mut state = lock(&self.state);
        if !matches!(*state, RecordingState::Idle) {
            return None;
        }
        let attempt = RecordingAttempt(begin_operation());
        reserve_recording_start(&mut state, binding_id, attempt).then_some(attempt)
    }

    pub(crate) fn is_attempt_active(&self, attempt: RecordingAttempt) -> bool {
        is_active_recording(&lock(&self.state), attempt)
    }

    pub(crate) fn claim_stop(&self, binding_id: &str) -> Option<RecordingStop> {
        claim_recording_stop(&mut lock(&self.state), binding_id)
    }

    /// Only way to flip the flag — updating the `Mutex<bool>` without its signal mirror re-opens the eviction race.
    fn set_is_recording(&self, active: bool) {
        *lock(&self.is_recording) = active;
        self.recording_signal.set(active);
    }

    fn preload_recorder(&self) -> Result<(), anyhow::Error> {
        let mut recorder = lock(&self.recorder);
        if recorder.is_some() {
            return Ok(());
        }

        let vad_path = self
            .app_handle
            .path()
            .resolve(
                "resources/models/silero_vad_v4.onnx",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| anyhow::anyhow!("Failed to resolve VAD path: {}", e))?;

        debug!("Preloading VAD model from {:?}", vad_path);

        let vad_path = vad_path
            .to_str()
            .context("VAD model path is not valid UTF-8")?;
        *recorder = Some(create_audio_recorder(vad_path, &self.app_handle)?);
        debug!("Audio recorder preloaded successfully");

        Ok(())
    }

    /* ---------- helper methods --------------------------------------------- */

    fn get_effective_microphone_device(&self, settings: &AppSettings) -> Option<cpal::Device> {
        let should_use_clamshell_device = if settings.clamshell_microphone.is_some() {
            match clamshell::is_clamshell() {
                Ok(is_clamshell) => is_clamshell,
                Err(err) => {
                    debug!("Failed to determine clamshell state: {}", err);
                    false
                }
            }
        } else {
            false
        };

        let device_name = if should_use_clamshell_device {
            settings.clamshell_microphone.as_deref()
        } else {
            settings.selected_microphone.as_deref()
        }?;

        self.selected_device_cache
            .resolve(device_name, || match list_input_devices() {
                Ok(devices) => devices
                    .into_iter()
                    .find(|device| device.name == device_name)
                    .map(|device| device.device),
                Err(error) => {
                    debug!("Failed to list devices, using default: {error}");
                    None
                }
            })
    }

    /* ---------- microphone life-cycle -------------------------------------- */

    pub(crate) fn apply_mute_if_active(&self, attempt: RecordingAttempt) {
        if is_active_recording(&lock(&self.state), attempt) {
            self.apply_mute();
        }
    }

    fn apply_mute(&self) {
        let settings = get_settings(&self.app_handle);
        let mut did_mute_guard = lock(&self.did_mute);

        if settings.mute_while_recording && *lock(&self.is_open) {
            set_mute(true);
            *did_mute_guard = true;
            debug!("Mute applied");
        }
    }

    pub fn remove_mute(&self) {
        let mut did_mute_guard = lock(&self.did_mute);
        if *did_mute_guard {
            set_mute(false);
            *did_mute_guard = false;
            debug!("Mute removed");
        }
    }

    pub fn start_microphone_stream(&self) -> Result<(), anyhow::Error> {
        let mut open_flag = lock(&self.is_open);
        if *open_flag {
            debug!("Microphone stream already active");
            return Ok(());
        }

        let start_time = Instant::now();
        *lock(&self.did_mute) = false;

        let vad_path = self
            .app_handle
            .path()
            .resolve(
                "resources/models/silero_vad_v4.onnx",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| anyhow::anyhow!("Failed to resolve VAD path: {}", e))?;
        let mut recorder_opt = lock(&self.recorder);

        if recorder_opt.is_none() {
            let vad_path = vad_path
                .to_str()
                .context("VAD model path is not valid UTF-8")?;
            *recorder_opt = Some(create_audio_recorder(vad_path, &self.app_handle)?);
        }

        let settings = get_settings(&self.app_handle);
        let selected_device = self.get_effective_microphone_device(&settings);

        if let Some(rec) = recorder_opt.as_mut() {
            if let Err(error) = rec.open(selected_device) {
                self.selected_device_cache.invalidate();
                return Err(anyhow::anyhow!("Failed to open recorder: {error}"));
            }
        }

        *open_flag = true;
        info!(
            "Microphone stream initialized in {:?}",
            start_time.elapsed()
        );
        Ok(())
    }

    pub fn stop_microphone_stream(&self) {
        self.remove_mute();

        let mut open_flag = lock(&self.is_open);
        if !*open_flag {
            return;
        }

        if let Some(rec) = lock(&self.recorder).as_mut() {
            if *lock(&self.is_recording) {
                let _ = rec.stop();
                self.set_is_recording(false);
            }
            let _ = rec.close();
        }

        *open_flag = false;
        debug!("Microphone stream stopped");
    }

    /* ---------- mode switching --------------------------------------------- */

    pub fn update_mode(&self, new_mode: MicrophoneMode) -> Result<(), anyhow::Error> {
        let mode_guard = lock(&self.mode);
        let cur_mode = mode_guard.clone();

        match (cur_mode, &new_mode) {
            (MicrophoneMode::AlwaysOn, MicrophoneMode::OnDemand) => {
                if matches!(*lock(&self.state), RecordingState::Idle) {
                    drop(mode_guard);
                    self.stop_microphone_stream();
                }
            }
            (MicrophoneMode::OnDemand, MicrophoneMode::AlwaysOn) => {
                drop(mode_guard);
                self.start_microphone_stream()?;
            }
            _ => {}
        }

        *lock(&self.mode) = new_mode;
        Ok(())
    }

    pub(crate) fn start_reserved_recording(
        &self,
        binding_id: &str,
        attempt: RecordingAttempt,
    ) -> bool {
        let on_demand = self.is_on_demand();
        if on_demand {
            if let Err(error) = self.start_microphone_stream() {
                self.release_reserved_start(binding_id, attempt);
                log::error!("Failed to open microphone stream: {error}");
                return false;
            }
        }

        let start = ReservedRecordingStart {
            attempt,
            binding_id: binding_id.to_string(),
            stream: self.prepare_dictation_streaming(binding_id),
        };
        if let Err(cancelled) = self.commit_reserved_recording(start) {
            cancelled.stream.cancel();
            if on_demand {
                self.close_microphone_if_idle();
            }
            return false;
        }
        true
    }

    fn is_on_demand(&self) -> bool {
        matches!(*lock(&self.mode), MicrophoneMode::OnDemand)
    }

    fn release_reserved_start(&self, binding_id: &str, attempt: RecordingAttempt) {
        let mut state = lock(&self.state);
        if is_reserved_recording(&state, binding_id, attempt) {
            *state = RecordingState::Idle;
        }
    }

    fn prepare_dictation_streaming(&self, binding_id: &str) -> PreparedDictationStream {
        let (chunk_tx, chunk_rx) = std::sync::mpsc::channel();
        let tm = self
            .app_handle
            .state::<Arc<TranscriptionManager>>()
            .inner()
            .clone();
        let (worker, handle) = match DictationStreamingWorker::spawn(self.app_handle.clone(), tm) {
            Ok(streaming) => streaming,
            Err(error) => {
                log::error!("Failed to spawn dictation streaming worker: {error}");
                return PreparedDictationStream::without_preview();
            }
        };
        let binding_id = binding_id.to_string();
        let forwarder = std::thread::spawn(move || {
            while let Ok(frame) = chunk_rx.recv() {
                worker.push_frame(frame);
            }
            debug!("Dictation forwarder finished for {binding_id}");
        });
        PreparedDictationStream {
            chunk_tx: Some(chunk_tx),
            session: Some(ActiveDictationStreaming { handle, forwarder }),
        }
    }

    fn commit_reserved_recording(
        &self,
        mut start: ReservedRecordingStart,
    ) -> Result<(), ReservedRecordingStart> {
        let mut state = lock(&self.state);
        if !is_reserved_recording(&state, &start.binding_id, start.attempt) {
            return Err(start);
        }
        let recorder = lock(&self.recorder);
        let Some(recorder) = recorder.as_ref() else {
            *state = RecordingState::Idle;
            return Err(start);
        };
        let mut current_stream = lock(&self.dictation_streaming);
        if let Err(error) = recorder.start(start.stream.chunk_tx.take()) {
            log::error!("Failed to start recorder: {error}");
            *state = RecordingState::Idle;
            return Err(start);
        }
        if let Some(previous) = current_stream.take() {
            log::warn!("Replacing live dictation stream");
            previous.cancel();
        }
        *current_stream = start.stream.session.take();
        self.set_is_recording(true);
        *state = RecordingState::Recording {
            attempt: start.attempt,
            binding_id: start.binding_id,
        };
        debug!("Recording started");
        Ok(())
    }

    fn close_microphone_if_idle(&self) {
        if matches!(*lock(&self.state), RecordingState::Idle) {
            self.stop_microphone_stream();
        }
    }

    pub fn update_selected_device(&self) -> Result<(), anyhow::Error> {
        self.selected_device_cache.invalidate();
        if *lock(&self.is_open) {
            self.stop_microphone_stream();
            self.start_microphone_stream()?;
        }
        Ok(())
    }

    pub(crate) fn stop_recording(
        &self,
        binding_id: &str,
        stop: RecordingStop,
    ) -> Option<RecordedDictation> {
        let (attempt, has_audio) = match stop {
            RecordingStop::Active { attempt } => (attempt, true),
            RecordingStop::Pending { attempt } => (attempt, false),
        };
        let mut state = lock(&self.state);
        if !begin_recording_teardown(&mut state, binding_id, attempt) {
            return None;
        }
        drop(state);
        if !has_audio {
            if self.is_on_demand() {
                self.stop_microphone_stream();
            }
            self.finish_recording_teardown(attempt);
            return None;
        }

        let captured = self.stop_recorder();
        let streaming_transcript = self.finish_dictation_streaming();
        self.set_is_recording(false);
        self.remove_mute();
        if self.is_on_demand() {
            self.stop_microphone_stream();
        }
        self.finish_recording_teardown(attempt);
        debug!("Got {} samples", captured.samples.len());
        Some(RecordedDictation {
            had_long_pause: captured.had_long_pause,
            samples: pad_short_samples(captured.samples),
            streaming_transcript,
        })
    }

    pub fn cancel_recording(&self) {
        let Some(attempt) = claim_recording_cancel(&mut lock(&self.state)) else {
            return;
        };

        if let Some(session) = lock(&self.dictation_streaming).take() {
            session.cancel();
        }

        if let Some(rec) = lock(&self.recorder).as_ref() {
            let _ = rec.stop();
        }

        self.set_is_recording(false);
        self.remove_mute();

        if self.is_on_demand() {
            self.stop_microphone_stream();
        }
        self.finish_recording_teardown(attempt);
    }

    fn stop_recorder(&self) -> crate::audio_toolkit::audio::recorder::RecordedAudio {
        let recorder = lock(&self.recorder);
        let Some(recorder) = recorder.as_ref() else {
            log::error!("Recorder not available");
            return crate::audio_toolkit::audio::recorder::RecordedAudio::default();
        };
        match recorder.stop_with_metadata() {
            Ok(recording) => recording,
            Err(error) => {
                log::error!("stop() failed: {error}");
                crate::audio_toolkit::audio::recorder::RecordedAudio::default()
            }
        }
    }

    fn finish_dictation_streaming(&self) -> Option<String> {
        lock(&self.dictation_streaming)
            .take()
            .and_then(ActiveDictationStreaming::finish)
    }

    fn finish_recording_teardown(&self, attempt: RecordingAttempt) {
        finish_recording_teardown(&mut lock(&self.state), attempt);
    }
}

/// Whisper decodes sub-second clips unreliably; an empty buffer stays empty so it has nothing to hallucinate over.
pub fn pad_short_samples(samples: Vec<f32>) -> Vec<f32> {
    let len = samples.len();
    if len == 0 || len >= WHISPER_SAMPLE_RATE {
        return samples;
    }
    let mut padded = samples;
    padded.resize(WHISPER_SAMPLE_RATE * 5 / 4, 0.0);
    padded
}

#[cfg(test)]
mod pad_tests {
    use super::{pad_short_samples, WHISPER_SAMPLE_RATE};

    #[test]
    fn empty_input_stays_empty() {
        let v: Vec<f32> = vec![];
        let padded = pad_short_samples(v);
        assert!(padded.is_empty());
    }

    #[test]
    fn input_below_one_second_pads_to_one_and_a_quarter_seconds() {
        let v: Vec<f32> = vec![0.1; WHISPER_SAMPLE_RATE / 2]; // 0.5s
        let padded = pad_short_samples(v);
        assert_eq!(padded.len(), WHISPER_SAMPLE_RATE * 5 / 4);
        for &s in &padded[..WHISPER_SAMPLE_RATE / 2] {
            assert_eq!(s, 0.1);
        }
        for &s in &padded[WHISPER_SAMPLE_RATE / 2..] {
            assert_eq!(s, 0.0);
        }
    }

    #[test]
    fn input_exactly_one_second_is_not_padded() {
        // guard is strict `<` — exactly 16_000 samples must pass through
        let v: Vec<f32> = vec![0.2; WHISPER_SAMPLE_RATE];
        let padded = pad_short_samples(v.clone());
        assert_eq!(padded, v);
    }

    #[test]
    fn input_above_one_second_is_not_padded() {
        let v: Vec<f32> = vec![0.3; WHISPER_SAMPLE_RATE * 3];
        let padded = pad_short_samples(v.clone());
        assert_eq!(padded.len(), v.len());
        assert_eq!(padded, v);
    }

    #[test]
    fn single_sample_input_is_padded() {
        let v: Vec<f32> = vec![0.4];
        let padded = pad_short_samples(v);
        assert_eq!(padded.len(), WHISPER_SAMPLE_RATE * 5 / 4);
        assert_eq!(padded[0], 0.4);
    }
}

#[cfg(test)]
mod recording_state_tests {
    use super::{
        begin_recording_teardown, claim_recording_cancel, claim_recording_stop,
        is_reserved_recording, recording_binding_id, reserve_recording_start, RecordingAttempt,
        RecordingState, RecordingStop,
    };

    #[test]
    fn active_binding_is_available_to_visible_recording_controls() {
        let active = RecordingState::Recording {
            attempt: RecordingAttempt(1),
            binding_id: "transcribe".to_string(),
        };

        assert_eq!(recording_binding_id(&active), Some("transcribe"));
        assert_eq!(recording_binding_id(&RecordingState::Idle), None);
    }

    #[test]
    fn pending_start_is_available_to_stop_controls() {
        let pending = RecordingState::Starting {
            attempt: RecordingAttempt(1),
            binding_id: "overlay_control".to_string(),
        };

        assert_eq!(recording_binding_id(&pending), Some("overlay_control"));
    }

    #[test]
    fn recording_start_is_reserved_before_microphone_startup() {
        let mut state = RecordingState::Idle;
        let attempt = RecordingAttempt(1);

        assert!(reserve_recording_start(
            &mut state,
            "overlay_control",
            attempt
        ));
        assert_eq!(recording_binding_id(&state), Some("overlay_control"));
        assert!(!reserve_recording_start(
            &mut state,
            "overlay_control",
            RecordingAttempt(2)
        ));
    }

    #[test]
    fn stale_start_cannot_consume_a_new_reservation_with_the_same_binding() {
        let first = RecordingAttempt(1);
        let second = RecordingAttempt(2);
        let mut state = RecordingState::Idle;

        assert!(reserve_recording_start(
            &mut state,
            "overlay_control",
            first
        ));
        state = RecordingState::Idle;
        assert!(reserve_recording_start(
            &mut state,
            "overlay_control",
            second
        ));

        assert!(!is_reserved_recording(&state, "overlay_control", first));
        assert!(is_reserved_recording(&state, "overlay_control", second));
    }

    #[test]
    fn stop_claim_blocks_pending_restart_until_cleanup() {
        let attempt = RecordingAttempt(1);
        let mut state = RecordingState::Starting {
            attempt,
            binding_id: "overlay_control".to_string(),
        };

        let stop = claim_recording_stop(&mut state, "overlay_control");

        assert_eq!(stop, Some(RecordingStop::Pending { attempt }));
        assert!(begin_recording_teardown(
            &mut state,
            "overlay_control",
            attempt
        ));
    }

    #[test]
    fn stop_claim_blocks_restart_until_exact_attempt_owns_teardown() {
        let attempt = RecordingAttempt(2);
        let mut state = RecordingState::Recording {
            attempt,
            binding_id: "overlay_control".to_string(),
        };

        let stop = claim_recording_stop(&mut state, "overlay_control");

        assert_eq!(stop, Some(RecordingStop::Active { attempt }));
        assert!(begin_recording_teardown(
            &mut state,
            "overlay_control",
            attempt
        ));
        assert!(!begin_recording_teardown(
            &mut state,
            "overlay_control",
            RecordingAttempt(1)
        ));
    }

    #[test]
    fn cancellation_has_one_exact_teardown_owner() {
        let attempt = RecordingAttempt(3);
        let mut state = RecordingState::Recording {
            attempt,
            binding_id: "overlay_control".to_string(),
        };

        assert_eq!(claim_recording_cancel(&mut state), Some(attempt));
        assert_eq!(claim_recording_cancel(&mut state), None);
        assert!(matches!(
            state,
            RecordingState::Finalizing {
                attempt: active,
                ..
            } if active == attempt
        ));
    }
}
