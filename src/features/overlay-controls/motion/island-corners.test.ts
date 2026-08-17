import { describe, expect, test } from "bun:test";
import { islandCornerRadii } from "@/features/overlay-controls/motion/island-corners";

describe("island corner radii", () => {
  test("the floating compact handle is a full pill", () => {
    expect(
      islandCornerRadii({
        anchor: "top",
        bridgeBand: null,
        isCompactHandle: true,
        presentation: "bar",
      })
    ).toEqual({
      borderBottomLeftRadius: 999,
      borderBottomRightRadius: 999,
      borderTopLeftRadius: 999,
      borderTopRightRadius: 999,
    });
  });

  test("surfaces round every corner while they float", () => {
    expect(
      islandCornerRadii({
        anchor: "bottom",
        bridgeBand: null,
        isCompactHandle: false,
        presentation: "bar",
      })
    ).toEqual({
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 10,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
    });
  });

  test("a docked surface squares the corners touching its edge", () => {
    expect(
      islandCornerRadii({
        anchor: "right",
        bridgeBand: null,
        isCompactHandle: false,
        presentation: "docked",
      })
    ).toEqual({
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 0,
    });
    expect(
      islandCornerRadii({
        anchor: "left",
        bridgeBand: null,
        isCompactHandle: false,
        presentation: "docked",
      })
    ).toEqual({
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 10,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 10,
    });
    expect(
      islandCornerRadii({
        anchor: "top",
        bridgeBand: null,
        isCompactHandle: false,
        presentation: "docked",
      })
    ).toEqual({
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 10,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    });
    expect(
      islandCornerRadii({
        anchor: "bottom",
        bridgeBand: null,
        isCompactHandle: false,
        presentation: "docked",
      })
    ).toEqual({
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
    });
  });

  test("a docked compact handle keeps its pill away from the edge", () => {
    expect(
      islandCornerRadii({
        anchor: "bottom",
        bridgeBand: null,
        isCompactHandle: true,
        presentation: "docked",
      })
    ).toEqual({
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: 999,
      borderTopRightRadius: 999,
    });
  });

  test("a lifted island rounds every corner: it hangs off nothing", () => {
    expect(
      islandCornerRadii({
        anchor: "right",
        bridgeBand: null,
        isCompactHandle: false,
        isDragging: true,
        presentation: "docked",
      })
    ).toEqual({
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 10,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
    });
  });

  test("a bridged surface hangs square and curves with the band under the cut-out", () => {
    expect(
      islandCornerRadii({
        anchor: "top",
        bridgeBand: 56,
        isCompactHandle: false,
        presentation: "bar",
      })
    ).toEqual({
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    });
  });

  test("the bridged curve never outgrows tall panels nor undercuts shallow bands", () => {
    const bottomFor = (bridgeBand: number) =>
      islandCornerRadii({
        anchor: "top",
        bridgeBand,
        isCompactHandle: false,
        presentation: "bar",
      }).borderBottomLeftRadius;
    expect(bottomFor(700)).toBe(28);
    expect(bottomFor(12)).toBe(10);
  });
});
