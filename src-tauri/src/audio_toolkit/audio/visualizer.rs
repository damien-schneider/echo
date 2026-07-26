const TARGET_FPS: usize = 30;
const MIN_DB: f32 = -60.0;
const MAX_DB: f32 = -6.0;
const ATTACK_SMOOTHING: f32 = 0.65;
const RELEASE_SMOOTHING: f32 = 0.22;

pub struct AudioVisualiser {
    samples_per_frame: usize,
    sample_count: usize,
    sum_squares: f32,
    peak: f32,
    smoothed_level: f32,
}

impl AudioVisualiser {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            samples_per_frame: (sample_rate as usize / TARGET_FPS).max(1),
            sample_count: 0,
            sum_squares: 0.0,
            peak: 0.0,
            smoothed_level: 0.0,
        }
    }

    pub fn recording_level(&mut self, samples: &[f32], recording: bool) -> Option<Vec<f32>> {
        if !recording {
            return None;
        }
        let mut emitted_level = None;

        for raw_sample in samples {
            let sample = finite_sample(*raw_sample);
            self.sum_squares += sample * sample;
            self.peak = self.peak.max(sample.abs());
            self.sample_count += 1;

            if self.sample_count == self.samples_per_frame {
                emitted_level = Some(self.finish_frame());
            }
        }

        emitted_level.map(|level| vec![level])
    }

    pub fn reset(&mut self) {
        self.sample_count = 0;
        self.sum_squares = 0.0;
        self.peak = 0.0;
        self.smoothed_level = 0.0;
    }

    fn finish_frame(&mut self) -> f32 {
        let rms = (self.sum_squares / self.sample_count as f32).sqrt();
        let target = normalize_level(rms, self.peak);
        let smoothing = if target > self.smoothed_level {
            ATTACK_SMOOTHING
        } else {
            RELEASE_SMOOTHING
        };
        self.smoothed_level += (target - self.smoothed_level) * smoothing;
        self.sample_count = 0;
        self.sum_squares = 0.0;
        self.peak = 0.0;
        self.smoothed_level.clamp(0.0, 1.0)
    }
}

fn finite_sample(sample: f32) -> f32 {
    if sample.is_finite() {
        sample.clamp(-1.0, 1.0)
    } else {
        0.0
    }
}

fn normalize_level(rms: f32, peak: f32) -> f32 {
    let amplitude = (rms * 0.75 + peak * 0.25).max(1e-6);
    let decibels = 20.0 * amplitude.log10();
    ((decibels - MIN_DB) / (MAX_DB - MIN_DB))
        .clamp(0.0, 1.0)
        .powf(0.75)
}

#[cfg(test)]
mod tests {
    use super::AudioVisualiser;

    #[test]
    fn high_sample_rate_visualization_emits_at_thirty_fps() {
        let mut visualizer = AudioVisualiser::new(48_000);
        let callback = vec![0.1_f32; 512];
        let emissions = (0..94)
            .filter(|_| visualizer.recording_level(&callback, true).is_some())
            .count();

        assert_eq!(emissions, 30);
    }

    #[test]
    fn louder_audio_produces_a_stronger_level() {
        let mut quiet_visualizer = AudioVisualiser::new(30);
        let mut loud_visualizer = AudioVisualiser::new(30);

        let quiet = quiet_visualizer
            .recording_level(&[0.002], true)
            .expect("quiet level")[0];
        let loud = loud_visualizer
            .recording_level(&[0.5], true)
            .expect("loud level")[0];

        assert!(loud > quiet, "quiet={quiet}, loud={loud}");
    }

    #[test]
    fn non_finite_and_out_of_range_samples_produce_a_finite_clamped_level() {
        let mut visualizer = AudioVisualiser::new(150);

        let levels = visualizer
            .recording_level(
                &[f32::NAN, f32::INFINITY, f32::NEG_INFINITY, 2.0, -2.0],
                true,
            )
            .expect("level");

        assert_eq!(levels.len(), 1);
        assert!(levels[0].is_finite());
        assert!((0.0..=1.0).contains(&levels[0]));
    }

    #[test]
    fn reset_discards_partial_meter_frame() {
        let mut visualizer = AudioVisualiser::new(300);

        assert!(visualizer.recording_level(&[0.5; 9], true).is_none());
        visualizer.reset();

        assert!(visualizer.recording_level(&[0.5], true).is_none());
    }

    #[test]
    fn idle_audio_does_not_advance_the_meter() {
        let mut visualizer = AudioVisualiser::new(300);

        assert!(visualizer.recording_level(&[0.5; 5], false).is_none());

        assert!(visualizer.recording_level(&[0.5; 9], true).is_none());
    }
}
