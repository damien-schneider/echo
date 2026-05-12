# Diarization Test Fixtures

Place the following files here to enable the integration test
`sortformer_diarizes_two_speakers_within_tolerance` in
`tests/diarization_integration.rs`:

- `diarize_two_speakers_30s.wav` — 16 kHz mono WAV, 30s, two distinct speakers
  (concatenated, e.g. 0–15s speaker A, 15–30s speaker B). License-free.
- `diarize_two_speakers_30s.expected.json` — hand-annotated:

```json
{
  "segments": [
    {"start_ms":     0, "end_ms": 15000, "speaker_id": 0},
    {"start_ms": 15000, "end_ms": 30000, "speaker_id": 1}
  ],
  "tolerance_ms": 1500,
  "allow_speaker_relabeling": true
}
```

Also requires the Sortformer model at:
`~/Library/Application Support/com.damien-schneider.echo/models/diarization-sortformer/diar_streaming_sortformer_4spk-v2.onnx`

Without all three files, the test skips silently.
