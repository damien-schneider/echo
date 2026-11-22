import { describe, expect, test } from "bun:test";
import {
  type IslandCornerRadii,
  islandCornerRadii,
} from "@/features/overlay-controls/motion/island-corners";

const chatCorners: IslandCornerRadii = {
  borderBottomLeftRadius: 37,
  borderBottomRightRadius: 37,
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
};

describe("island corner radii", () => {
  test("a floating island wears its content's corners, so what sits in them stays concentric", () => {
    expect(
      islandCornerRadii({
        anchor: "top",
        bridgeBand: null,
        presentation: "bar",
        shape: chatCorners,
      })
    ).toEqual(chatCorners);
  });

  test("a bridged island hangs square under the cut-out and keeps its content's bottom curve", () => {
    expect(
      islandCornerRadii({
        anchor: "top",
        bridgeBand: 700,
        presentation: "bar",
        shape: chatCorners,
      })
    ).toEqual({
      borderBottomLeftRadius: 37,
      borderBottomRightRadius: 37,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    });
  });

  test("a bridged pill curves by half the band it hangs below the cut-out", () => {
    expect(
      islandCornerRadii({
        anchor: "top",
        bridgeBand: 40,
        presentation: "bar",
        shape: "pill",
      }).borderBottomLeftRadius
    ).toBe(20);
  });

  test("a side dock squares the corners touching its edge", () => {
    expect(
      islandCornerRadii({
        anchor: "right",
        bridgeBand: null,
        presentation: "docked",
        shape: chatCorners,
      })
    ).toEqual({
      ...chatCorners,
      borderBottomRightRadius: 0,
      borderTopRightRadius: 0,
    });
    expect(
      islandCornerRadii({
        anchor: "left",
        bridgeBand: null,
        presentation: "docked",
        shape: chatCorners,
      })
    ).toEqual({
      ...chatCorners,
      borderBottomLeftRadius: 0,
      borderTopLeftRadius: 0,
    });
  });

  test("a lifted island rounds every corner: it hangs off nothing", () => {
    expect(
      islandCornerRadii({
        anchor: "right",
        bridgeBand: null,
        isDragging: true,
        presentation: "docked",
        shape: chatCorners,
      })
    ).toEqual(chatCorners);
  });
});
