import { describe, expect, test } from "bun:test";
import {
  SCREEN_HANDOFF_ARRIVAL_MS,
  SCREEN_HANDOFF_COMMAND,
  SCREEN_HANDOFF_FADE_MS,
  SCREEN_HANDOFF_STYLE,
  screenHandoffFreezesLayout,
} from "@/features/overlay-controls/runtime/screen-handoff";

describe("screen handoff timing", () => {
  test("the fade out is shorter than the arrival that covers the repaint", () => {
    expect(SCREEN_HANDOFF_FADE_MS).toBeLessThan(SCREEN_HANDOFF_ARRIVAL_MS);
  });

  test("css reads the same durations the timers do", () => {
    expect(SCREEN_HANDOFF_STYLE).toEqual({
      "--echo-handoff-arrival": `${SCREEN_HANDOFF_ARRIVAL_MS}ms`,
      "--echo-handoff-fade": `${SCREEN_HANDOFF_FADE_MS}ms`,
    });
  });

  test("one native command moves the island to the cursor screen", () => {
    expect(SCREEN_HANDOFF_COMMAND).toBe(
      "move_recording_overlay_to_cursor_screen"
    );
  });
});

describe("screen handoff layout freeze", () => {
  test("a teleport never springs the island across the gap", () => {
    expect(screenHandoffFreezesLayout("leaving")).toBe(true);
    expect(screenHandoffFreezesLayout("arriving")).toBe(true);
  });

  test("a settled island morphs as usual", () => {
    expect(screenHandoffFreezesLayout("idle")).toBe(false);
  });
});
