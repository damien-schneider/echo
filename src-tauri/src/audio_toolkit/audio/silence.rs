/// Below this a sample is not quiet but absent — the pipe delivers digital zeros when macOS denies
/// the microphone or the device is muted at the source.
const DIGITAL_SILENCE_AMPLITUDE: f32 = 1e-4;

pub(crate) fn is_digital_silence(samples: &[f32]) -> bool {
    !samples
        .iter()
        .any(|sample| sample.abs() >= DIGITAL_SILENCE_AMPLITUDE)
}
