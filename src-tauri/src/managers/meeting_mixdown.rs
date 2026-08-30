//! One playable file where both halves of the conversation are audible, on a single timeline.

use anyhow::Result;
use std::path::Path;

use crate::audio_toolkit::audio::{create_wav_file, read_wav_range, write_wav_samples};
use crate::managers::meeting_batch::wav_sample_count;
use crate::managers::meeting_types::{ms_to_samples, SAMPLE_RATE};

/// Hours of meeting are mixed a window at a time: neither track is ever held whole in memory.
const MIX_WINDOW_SAMPLES: usize = 30 * SAMPLE_RATE;

pub(super) fn mix_file_name(meeting_id: i64) -> String {
    format!("meeting-{meeting_id}-mix.wav")
}

pub(super) struct MixSources<'a> {
    pub mic: &'a Path,
    pub system: &'a Path,
    pub out: &'a Path,
    pub system_offset_ms: i64,
}

pub(super) fn write_mixdown(sources: MixSources<'_>) -> Result<()> {
    let mixdown = Mixdown::open(sources)?;
    let total = mixdown.total_samples();

    let mut writer = create_wav_file(mixdown.sources.out)?;
    let mut start = 0;
    while start < total {
        let end = (start + MIX_WINDOW_SAMPLES).min(total);
        write_wav_samples(&mut writer, &mixdown.window(start, end)?)?;
        start = end;
    }
    writer.finalize()?;
    Ok(())
}

struct Mixdown<'a> {
    sources: MixSources<'a>,
    offset: usize,
    mic_len: usize,
    system_len: usize,
}

impl<'a> Mixdown<'a> {
    fn open(sources: MixSources<'a>) -> Result<Self> {
        let offset = ms_to_samples(sources.system_offset_ms);
        let mic_len = wav_sample_count(sources.mic)?;
        let system_len = wav_sample_count(sources.system)?;
        Ok(Self {
            sources,
            offset,
            mic_len,
            system_len,
        })
    }

    fn total_samples(&self) -> usize {
        self.mic_len.max(self.offset + self.system_len)
    }

    fn window(&self, start: usize, end: usize) -> Result<Vec<f32>> {
        let mic = read_wav_range(
            self.sources.mic,
            start.min(self.mic_len),
            end.min(self.mic_len),
        )?;

        let lead = self.offset.saturating_sub(start).min(end - start);
        let mut system = vec![0.0; lead];
        system.extend(read_wav_range(
            self.sources.system,
            start.saturating_sub(self.offset).min(self.system_len),
            end.saturating_sub(self.offset).min(self.system_len),
        )?);

        Ok(sum_tracks(&mic, &system))
    }
}

/// Summed, not averaged: a guest recorded quietly stays as loud as they were.
fn sum_tracks(mic: &[f32], system: &[f32]) -> Vec<f32> {
    let len = mic.len().max(system.len());
    (0..len)
        .map(|i| {
            let mic_sample = mic.get(i).copied().unwrap_or(0.0);
            let system_sample = system.get(i).copied().unwrap_or(0.0);
            (mic_sample + system_sample).clamp(-1.0, 1.0)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio_toolkit::audio::{load_wav_file, save_wav_file};
    use tempfile::TempDir;

    /// Two people talking at once must not wrap around into a click.
    #[test]
    fn both_voices_survive_the_sum_without_wrapping() {
        assert_eq!(sum_tracks(&[0.9, 0.1], &[0.9, 0.2]), vec![1.0, 0.3]);
        assert_eq!(sum_tracks(&[-0.9], &[-0.9]), vec![-1.0]);
    }

    #[test]
    fn a_track_that_ends_early_leaves_the_other_one_playing() {
        assert_eq!(sum_tracks(&[0.5, 0.5], &[0.25]), vec![0.75, 0.5]);
    }

    /// System capture starts after the mic: playing it from sample 0 would desync the whole meeting.
    #[test]
    fn the_system_track_lands_where_it_was_recorded() {
        let dir = TempDir::new().unwrap();
        let mic = dir.path().join("mic.wav");
        let system = dir.path().join("system.wav");
        let out = dir.path().join("mix.wav");
        save_wav_file(&mic, &vec![0.25; SAMPLE_RATE]).unwrap();
        save_wav_file(&system, &vec![0.5; SAMPLE_RATE / 2]).unwrap();

        write_mixdown(MixSources {
            mic: &mic,
            system: &system,
            out: &out,
            system_offset_ms: 500,
        })
        .unwrap();

        let mixed = load_wav_file(&out).unwrap();
        assert_eq!(mixed.len(), SAMPLE_RATE);
        assert!(
            (mixed[0] - 0.25).abs() < 0.01,
            "mic alone before the guest joins"
        );
        assert!(
            (mixed[SAMPLE_RATE / 2 + 10] - 0.75).abs() < 0.01,
            "both tracks audible once the guest joins"
        );
    }

    #[test]
    fn a_guest_still_talking_after_the_mic_stops_is_not_cut_off() {
        let dir = TempDir::new().unwrap();
        let mic = dir.path().join("mic.wav");
        let system = dir.path().join("system.wav");
        let out = dir.path().join("mix.wav");
        save_wav_file(&mic, &vec![0.25; 100]).unwrap();
        save_wav_file(&system, &vec![0.5; SAMPLE_RATE]).unwrap();

        write_mixdown(MixSources {
            mic: &mic,
            system: &system,
            out: &out,
            system_offset_ms: 1000,
        })
        .unwrap();

        assert_eq!(load_wav_file(&out).unwrap().len(), 2 * SAMPLE_RATE);
    }
}
