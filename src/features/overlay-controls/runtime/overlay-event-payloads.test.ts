import { describe, expect, it } from "bun:test";
import {
  ModelDownloadTerminalSchema,
  TranscriptionProgressSchema,
} from "@/features/overlay-controls/runtime/overlay-event-payloads";

describe("overlay event payload schemas", () => {
  it("accepts visible transcription progress and rejects empty payloads", () => {
    expect(TranscriptionProgressSchema.safeParse("live words").success).toBe(
      true
    );
    expect(TranscriptionProgressSchema.safeParse("  \n\t ").success).toBe(
      false
    );
    expect(
      TranscriptionProgressSchema.safeParse({ text: "words" }).success
    ).toBe(false);
  });

  it("accepts model identifiers and rejects malformed terminal payloads", () => {
    expect(ModelDownloadTerminalSchema.safeParse("medium").success).toBe(true);
    expect(ModelDownloadTerminalSchema.safeParse("").success).toBe(false);
    expect(
      ModelDownloadTerminalSchema.safeParse({ model_id: "medium" }).success
    ).toBe(false);
  });
});
