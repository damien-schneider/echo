import { describe, expect, it } from "bun:test";
import {
  activityDismissalFor,
  isActiveOverlayState,
  microphoneIntensity,
  updateMicrophoneAmbience,
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

describe("microphone ambience", () => {
  it("summarizes all bands without favoring a fixed four-bar layout", () => {
    expect(microphoneIntensity([])).toEqual({ energy: 0, peak: 0 });
    const quiet = microphoneIntensity([0.04, 0.04, 0.04, 0.04]);
    const loud = microphoneIntensity([0.8, 0.9, 0.7, 1]);

    expect(loud.energy).toBeGreaterThan(quiet.energy);
    expect(loud.peak).toBe(1);
  });

  it("maps microphone energy to compositor-friendly CSS variables", () => {
    const properties = new Map<string, string>();
    updateMicrophoneAmbience(
      {
        style: {
          setProperty: (name, value) => properties.set(name, value),
        },
      },
      [0.04, 0.09, 0.16, 0.25]
    );

    expect(Number(properties.get("--echo-mic-energy"))).toBeGreaterThan(0);
    expect(Number(properties.get("--echo-mic-peak"))).toBeCloseTo(0.25);
  });

  it("clamps malformed and overdriven input to the visual range", () => {
    const properties = new Map<string, string>();
    updateMicrophoneAmbience(
      {
        style: {
          setProperty: (name, value) => properties.set(name, value),
        },
      },
      [Number.NaN, -1, 4]
    );

    expect(Number(properties.get("--echo-mic-energy"))).toBeLessThanOrEqual(1);
    expect(Number(properties.get("--echo-mic-peak"))).toBe(1);
  });
});
