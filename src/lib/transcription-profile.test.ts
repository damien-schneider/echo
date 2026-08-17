import { describe, expect, test } from "bun:test";
import {
  TranscriptionModelSizeSchema,
  TranscriptionProfileStatusSchema,
} from "@/lib/types";

describe("TranscriptionModelSizeSchema", () => {
  test("accepts only the three product sizes", () => {
    expect(TranscriptionModelSizeSchema.parse("small")).toBe("small");
    expect(TranscriptionModelSizeSchema.parse("medium")).toBe("medium");
    expect(TranscriptionModelSizeSchema.parse("large")).toBe("large");
    expect(TranscriptionModelSizeSchema.safeParse("tiny").success).toBe(false);
    expect(TranscriptionModelSizeSchema.safeParse("turbo").success).toBe(false);
  });
});

describe("TranscriptionProfileStatusSchema", () => {
  test("accepts the complete profile status payload", () => {
    const result = TranscriptionProfileStatusSchema.parse({
      description: "Best balance of speed and accuracy",
      download_size_mb: 574,
      is_active: true,
      is_downloaded: true,
      is_downloading: false,
      is_recommended: true,
      label: "Medium",
      size: "medium",
    });

    expect(result.size).toBe("medium");
    expect(result.is_recommended).toBe(true);
  });

  test("rejects internal model implementation fields", () => {
    const result = TranscriptionProfileStatusSchema.safeParse({
      description: "Fast",
      download_size_mb: 190,
      engine_type: "whisper",
      is_active: false,
      is_downloaded: false,
      is_downloading: false,
      is_recommended: false,
      label: "Small",
      size: "small",
    });

    expect(result.success).toBe(false);
  });
});
