use super::silero::SILERO_FRAME_SAMPLES;
use super::VoiceActivityDetector;

/// Feeds a stream of any buffer size to a frame-sized VAD; a partial frame waits for the next push.
pub struct SpeechFrames {
    vad: Box<dyn VoiceActivityDetector>,
    pending: Vec<f32>,
}

impl SpeechFrames {
    pub fn new(vad: Box<dyn VoiceActivityDetector>) -> Self {
        Self {
            vad,
            pending: Vec::with_capacity(SILERO_FRAME_SAMPLES),
        }
    }

    pub fn push(&mut self, mut samples: &[f32], on_frame: &mut dyn FnMut(&[f32], bool)) {
        if !self.pending.is_empty() {
            let missing = SILERO_FRAME_SAMPLES - self.pending.len();
            let (head, rest) = samples.split_at(missing.min(samples.len()));
            self.pending.extend_from_slice(head);
            samples = rest;
            if self.pending.len() < SILERO_FRAME_SAMPLES {
                return;
            }
            let frame = std::mem::take(&mut self.pending);
            on_frame(&frame, self.is_speech(&frame));
            self.pending = frame;
            self.pending.clear();
        }
        let mut frames = samples.chunks_exact(SILERO_FRAME_SAMPLES);
        for frame in &mut frames {
            on_frame(frame, self.is_speech(frame));
        }
        self.pending.extend_from_slice(frames.remainder());
    }

    fn is_speech(&mut self, frame: &[f32]) -> bool {
        self.vad.is_voice(frame).unwrap_or_else(|e| {
            log::debug!("VAD failed on a frame, counted as silence: {e:#}");
            false
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_toolkit::vad::VadFrame;
    use std::sync::{Arc, Mutex};

    struct FrameLengths(Arc<Mutex<Vec<usize>>>);

    impl VoiceActivityDetector for FrameLengths {
        fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> anyhow::Result<VadFrame<'a>> {
            self.0.lock().unwrap().push(frame.len());
            Ok(VadFrame::Speech(frame))
        }
    }

    #[test]
    fn buffers_of_any_size_reach_the_vad_as_whole_frames_in_order() {
        let lengths = Arc::new(Mutex::new(Vec::new()));
        let mut speech = SpeechFrames::new(Box::new(FrameLengths(lengths.clone())));
        let stream: Vec<f32> = (0..3 * SILERO_FRAME_SAMPLES + 7)
            .map(|i| i as f32)
            .collect();
        let mut seen = Vec::new();

        for buffer in [&stream[..100], &stream[100..1_100], &stream[1_100..]] {
            speech.push(buffer, &mut |frame, _| seen.extend_from_slice(frame));
        }

        assert_eq!(*lengths.lock().unwrap(), vec![SILERO_FRAME_SAMPLES; 3]);
        assert_eq!(seen, stream[..3 * SILERO_FRAME_SAMPLES]);
    }
}
