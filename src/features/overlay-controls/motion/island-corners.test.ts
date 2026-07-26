import { describe, expect, test } from "bun:test";
import { islandCornerRadii } from "@/features/overlay-controls/motion/island-corners";

describe("island corner radii", () => {
  test("the floating compact handle is a full pill", () => {
    expect(
      islandCornerRadii({
        anchor: "top",
        bridgesNotch: false,
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
        bridgesNotch: false,
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
        bridgesNotch: false,
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
        bridgesNotch: false,
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
        bridgesNotch: false,
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
        bridgesNotch: false,
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
        bridgesNotch: false,
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

  test("a surface bridged to the notch squares the corners it hangs from", () => {
    expect(
      islandCornerRadii({
        anchor: "top",
        bridgesNotch: true,
        isCompactHandle: false,
        presentation: "bar",
      })
    ).toEqual({
      borderBottomLeftRadius: 10,
      borderBottomRightRadius: 10,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    });
  });
});
