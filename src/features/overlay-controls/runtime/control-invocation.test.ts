import { describe, expect, test } from "bun:test";
import {
  controlFailureMessage,
  invokeOverlayControl,
} from "@/features/overlay-controls/runtime/control-invocation";

describe("invokeOverlayControl", () => {
  test("maps a control action to its Tauri command", async () => {
    let invokedCommand = "";
    const failure = await invokeOverlayControl({
      action: "start_recording",
      invokeCommand: (command) => {
        invokedCommand = command;
        return Promise.resolve();
      },
    });

    expect(invokedCommand).toBe("start_transcription_from_overlay");
    expect(failure).toBeNull();
  });

  test("turns command rejection into an actionable visible message", async () => {
    const failure = await invokeOverlayControl({
      action: "polish",
      invokeCommand: () => Promise.reject(new Error("sidecar crashed")),
    });

    expect(failure).toBe("Couldn’t polish the selection. Try again.");
  });

  test("has specific English copy for every control action", () => {
    expect(controlFailureMessage("start_recording")).toBe(
      "Couldn’t start recording. Try again."
    );
    expect(controlFailureMessage("stop_recording")).toBe(
      "Couldn’t stop recording. Try again."
    );
    expect(controlFailureMessage("polish")).toBe(
      "Couldn’t polish the selection. Try again."
    );
  });
});
