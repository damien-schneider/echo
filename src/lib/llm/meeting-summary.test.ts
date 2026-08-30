import { describe, expect, it } from "bun:test";
import {
  generateMeetingSummary,
  MeetingSummaryError,
  splitTranscript,
} from "@/lib/llm/meeting-summary";
import { SettingsSchema } from "@/lib/types";

const line = (speaker: string, text: string) =>
  `[00:00:00] ${speaker}: ${text}`;

describe("splitTranscript", () => {
  it("keeps a transcript that fits in one chunk", () => {
    const transcript = `${line("Speaker 1", "hello")}\n${line("Guest 1", "hi")}`;
    expect(splitTranscript(transcript, 1000)).toEqual([transcript]);
  });

  it("never cuts an utterance in half", () => {
    const transcript = [
      line("Speaker 1", "a".repeat(40)),
      line("Guest 1", "b".repeat(40)),
      line("Speaker 1", "c".repeat(40)),
    ].join("\n");

    const chunks = splitTranscript(transcript, 80);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      for (const chunkLine of chunk.split("\n")) {
        expect(transcript.includes(chunkLine)).toBe(true);
      }
    }
  });

  it("loses nothing when it splits", () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      line(`Speaker ${i}`, "word ".repeat(10))
    );
    const chunks = splitTranscript(lines.join("\n"), 200);
    expect(chunks.join("\n").split("\n")).toEqual(lines);
  });

  it("keeps an oversized utterance whole rather than truncating it", () => {
    const huge = line("Speaker 1", "x".repeat(500));
    const chunks = splitTranscript(`${huge}\n${line("Guest 1", "ok")}`, 100);
    expect(chunks[0]).toBe(huge);
  });

  it("drops blank lines so no chunk is spent on nothing", () => {
    expect(splitTranscript("\n\n  \n", 100)).toEqual([]);
  });
});

describe("generateMeetingSummary setup errors", () => {
  const cloudSettings = SettingsSchema.parse({
    always_on_microphone: false,
    audio_feedback: false,
    bindings: {},
    debug_mode: false,
    meeting_summary_engine: "cloud",
    overlay_position: "bottom",
    push_to_talk: false,
    selected_language: "auto",
    translate_to_english: false,
  });

  it("points at the AI settings when no cloud provider is configured", async () => {
    const error: unknown = await generateMeetingSummary(
      line("Speaker 1", "hello"),
      cloudSettings
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MeetingSummaryError);
    if (error instanceof MeetingSummaryError) {
      expect(error.section).toBe("post-processing");
    }
  });
});
