import { describe, expect, it } from "bun:test";
import { splitTranscript } from "@/lib/llm/meeting-summary";

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
