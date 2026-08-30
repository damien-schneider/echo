import { describe, expect, it } from "bun:test";
import { orderedTranscript } from "@/features/meeting/transcript-order";
import type { MeetingSegment } from "@/lib/types";

const segment = (startMs: number, text: string): MeetingSegment => ({
  audio_source: "mic",
  confidence: null,
  end_ms: startMs + 1000,
  id: startMs,
  meeting_id: 1,
  speaker_label: "Speaker 1",
  start_ms: startMs,
  text,
});

describe("orderedTranscript", () => {
  // The batch pass writes the mic stream end to end, then the system stream.
  it("reads as one conversation, not one stream after the other", () => {
    const batch = [
      segment(0, "mic first"),
      segment(20_000, "mic last"),
      segment(5000, "guest early"),
      segment(30_000, "guest late"),
    ];

    expect(orderedTranscript([], batch).map((s) => s.text)).toEqual([
      "mic first",
      "guest early",
      "mic last",
      "guest late",
    ]);
  });

  it("places live segments by their timestamp, not after everything", () => {
    const streaming = [segment(1000, "live")];
    const batch = [segment(0, "batch")];

    expect(orderedTranscript(streaming, batch).map((s) => s.text)).toEqual([
      "batch",
      "live",
    ]);
  });

  it("leaves the inputs untouched", () => {
    const batch = [segment(20_000, "late"), segment(0, "early")];
    orderedTranscript([], batch);
    expect(batch[0]?.text).toBe("late");
  });
});
