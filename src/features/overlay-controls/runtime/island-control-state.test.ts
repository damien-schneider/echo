import { describe, expect, test } from "bun:test";
import {
  beginIslandCollapse,
  finishIslandCollapse,
  initialIslandControlMotionState,
  revealIslandControls,
} from "@/features/overlay-controls/runtime/island-control-state";

describe("island control motion", () => {
  test("reveal opens the controls", () => {
    expect(revealIslandControls()).toMatchObject({
      isControlsOpen: true,
      motionPhase: "open",
    });
  });

  test("begin collapse starts shell shrink while actions finish exiting", () => {
    expect(beginIslandCollapse(revealIslandControls())).toMatchObject({
      isControlsOpen: false,
      motionPhase: "closing",
    });
  });

  test("collapsing an already closed handle changes nothing", () => {
    expect(beginIslandCollapse(initialIslandControlMotionState)).toBe(
      initialIslandControlMotionState
    );
  });

  test("re-enter cancels a pending collapse", () => {
    const closing = beginIslandCollapse(revealIslandControls());
    const reopened = revealIslandControls();

    expect(reopened).toMatchObject({
      isControlsOpen: true,
      motionPhase: "open",
    });
    expect(finishIslandCollapse(reopened)).toBe(reopened);
    expect(closing.motionPhase).toBe("closing");
  });

  test("finish collapse returns to compact mode", () => {
    const closing = beginIslandCollapse(revealIslandControls());

    expect(finishIslandCollapse(closing)).toMatchObject({
      isControlsOpen: false,
      motionPhase: "compact",
    });
  });
});
