import { describe, expect, test } from "bun:test";
import { overlayControlCommand } from "@/overlay/overlay-controls";

describe("overlayControlCommand", () => {
  test("maps visible controls to narrow Tauri commands", () => {
    expect(overlayControlCommand("start_recording")).toBe(
      "start_transcription_from_overlay"
    );
    expect(overlayControlCommand("stop_recording")).toBe(
      "stop_transcription_from_overlay"
    );
    expect(overlayControlCommand("polish")).toBe("run_polish_from_overlay");
  });
});
