import { describe, expect, it } from "bun:test";
import {
  activityDismissalFor,
  isActiveOverlayState,
  voiceLevel,
} from "@/features/overlay-controls/recording-overlay-state";

describe("recording activity semantics", () => {
  it("treats only real recording work as globally cancellable", () => {
    for (const state of ["recording", "transcribing", "processing"] as const) {
      expect(isActiveOverlayState(state)).toBe(true);
    }
    expect(isActiveOverlayState("warning")).toBe(false);
    expect(isActiveOverlayState("tool")).toBe(false);
  });

  it("labels cancellation separately from passive dismissal", () => {
    expect(
      activityDismissalFor({
        hasActiveOperation: true,
        hasMeetingNotice: false,
        hasPassiveActivity: false,
        hasUpdateNotice: false,
      })
    ).toEqual({
      intent: "cancel_operation",
      label: "Cancel current operation",
    });
    expect(
      activityDismissalFor({
        hasActiveOperation: false,
        hasMeetingNotice: false,
        hasPassiveActivity: true,
        hasUpdateNotice: false,
      })
    ).toEqual({ intent: "dismiss_surface", label: "Dismiss notification" });
  });

  it("dismisses an update notice without touching the activity stream", () => {
    expect(
      activityDismissalFor({
        hasActiveOperation: false,
        hasMeetingNotice: false,
        hasPassiveActivity: false,
        hasUpdateNotice: true,
      })
    ).toEqual({ intent: "dismiss_update", label: "Dismiss update notice" });
    expect(
      activityDismissalFor({
        hasActiveOperation: false,
        hasMeetingNotice: false,
        hasPassiveActivity: false,
        hasUpdateNotice: false,
      })
    ).toBeNull();
  });
});

describe("voice level", () => {
  it("keeps the edge light calm for room noise and fully lit for speech", () => {
    const roomNoise = voiceLevel([0.28]);
    const quietSpeech = voiceLevel([0.56]);
    const speech = voiceLevel([0.8]);

    expect(roomNoise).toBe(0);
    expect(quietSpeech).toBeGreaterThan(0.3);
    expect(quietSpeech).toBeLessThan(speech);
    expect(speech).toBe(1);
  });

  it("reads malformed and overdriven levels within the visual range", () => {
    expect(voiceLevel([])).toBe(0);
    expect(voiceLevel([Number.NaN, -1])).toBe(0);
    expect(voiceLevel([4])).toBe(1);
  });
});
