import { describe, expect, it } from "bun:test";
import { visibleTranscript } from "@/features/meeting/transcript-order";
import type {
  MeetingBatchProgress,
  MeetingSegment,
  StreamingSource,
} from "@/lib/types";

const segment = (
  source: StreamingSource,
  startMs: number,
  text: string
): MeetingSegment => ({
  audio_source: source,
  confidence: null,
  end_ms: startMs + 1000,
  id: startMs,
  meeting_id: 1,
  speaker_label: source === "mic" ? "Speaker 1" : "Guest 1",
  start_ms: startMs,
  text,
});

const progress = (
  source: StreamingSource,
  phase: MeetingBatchProgress["phase"]
): MeetingBatchProgress => ({
  chunks_done: 0,
  chunks_total: 4,
  meeting_id: 1,
  phase,
  source,
});

const texts = (segments: MeetingSegment[]) => segments.map((s) => s.text);

describe("visibleTranscript", () => {
  // The batch pass writes the mic stream end to end, then the system stream.
  it("reads as one conversation, not one stream after the other", () => {
    const batch = [
      segment("mic", 0, "mic first"),
      segment("mic", 20_000, "mic last"),
      segment("system", 5000, "guest early"),
      segment("system", 30_000, "guest late"),
    ];

    expect(texts(visibleTranscript([], batch, {}))).toEqual([
      "mic first",
      "guest early",
      "mic last",
      "guest late",
    ]);
  });

  it("places live segments by their timestamp, not after everything", () => {
    const streaming = [segment("system", 1000, "live guest")];
    const batch = [segment("mic", 0, "batch mic")];

    expect(texts(visibleTranscript(streaming, batch, {}))).toEqual([
      "batch mic",
      "live guest",
    ]);
  });

  it("keeps the live text of a source until its batch rows start", () => {
    const streaming = [
      segment("mic", 0, "live mic"),
      segment("system", 2000, "live guest"),
    ];
    const batch = [segment("mic", 100, "batch mic")];
    const batchProgress = {
      mic: progress("mic", "transcribing"),
      system: progress("system", "diarizing"),
    };

    expect(texts(visibleTranscript(streaming, batch, batchProgress))).toEqual([
      "batch mic",
      "live guest",
    ]);
  });

  it("never shows a source twice", () => {
    const streaming = [
      segment("mic", 0, "live mic"),
      segment("system", 2000, "live guest"),
    ];
    const batch = [
      segment("mic", 100, "batch mic"),
      segment("system", 2100, "batch guest"),
    ];

    expect(texts(visibleTranscript(streaming, batch, {}))).toEqual([
      "batch mic",
      "batch guest",
    ]);
  });
});
