import { describe, expect, it } from "bun:test";
import {
  createHudPresentation,
  isSideDockedSurface,
} from "@/features/overlay-controls/overlay-presentation";

describe("hud presentation", () => {
  it("rests as a handle and widens only for its own action row", () => {
    expect(
      createHudPresentation({
        isControlsOpen: false,
        isVisible: false,
        state: "recording",
      }).mode
    ).toBe("compact");
    expect(
      createHudPresentation({
        isControlsOpen: true,
        isVisible: false,
        state: "recording",
      }).mode
    ).toBe("actions");
  });

  it("lights the record button from the activity stream alone", () => {
    const recording = createHudPresentation({
      isControlsOpen: false,
      isVisible: true,
      state: "recording",
    });
    const transcribing = createHudPresentation({
      isControlsOpen: false,
      isVisible: true,
      state: "transcribing",
    });
    const warning = createHudPresentation({
      isControlsOpen: false,
      isVisible: true,
      state: "warning",
    });

    expect(recording.actionState).toBe("recording");
    expect(transcribing.actionState).toBe("busy");
    expect(warning.actionState).toBe("idle");
    expect(warning.hasActiveOperation).toBe(false);
  });
});

describe("side docked surface", () => {
  it("only counts a docked left or right edge", () => {
    expect(
      isSideDockedSurface({ anchor: "left", presentation: "docked" })
    ).toBe(true);
    expect(isSideDockedSurface({ anchor: "top", presentation: "docked" })).toBe(
      false
    );
    expect(isSideDockedSurface({ anchor: "left", presentation: "bar" })).toBe(
      false
    );
    expect(isSideDockedSurface(null)).toBe(false);
  });
});
