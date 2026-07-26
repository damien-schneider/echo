use echo_app_lib::managers::whisper_runtime::{WhisperDecodeOptions, WhisperRuntime};

#[test]
#[ignore = "requires ECHO_WHISPER_MODEL and ECHO_WHISPER_SAMPLE_WAV"]
fn official_whisper_model_transcribes_real_speech() -> anyhow::Result<()> {
    let model_path = std::env::var("ECHO_WHISPER_MODEL")?;
    let sample_path = std::env::var("ECHO_WHISPER_SAMPLE_WAV")?;
    let mut reader = hound::WavReader::open(sample_path)?;
    let spec = reader.spec();
    assert_eq!(spec.sample_rate, 16_000);
    assert_eq!(spec.channels, 1);
    let audio = reader
        .samples::<i16>()
        .map(|sample| sample.map(|value| value as f32 / i16::MAX as f32))
        .collect::<Result<Vec<_>, _>>()?;

    let runtime = WhisperRuntime::new();
    runtime.load("small", std::path::Path::new(&model_path))?;
    let transcript = runtime.transcribe(
        &audio,
        &WhisperDecodeOptions {
            language: None,
            translate: false,
            threads: 4,
        },
    )?;
    let normalized = transcript.to_lowercase();

    assert!(normalized.contains("fellow"), "transcript: {transcript}");
    assert!(normalized.contains("country"), "transcript: {transcript}");
    Ok(())
}
