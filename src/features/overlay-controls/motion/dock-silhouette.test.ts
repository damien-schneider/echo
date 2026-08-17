import { describe, expect, test } from "bun:test";
import {
  dockShoulder,
  dockSilhouettePath,
} from "@/features/overlay-controls/motion/dock-silhouette";

describe("dock shoulder", () => {
  test("a floating surface hangs off no edge", () => {
    expect(
      dockShoulder({
        anchor: "top",
        isDragging: false,
        mode: "actions",
        presentation: "bar",
      })
    ).toBe(0);
  });

  test("a side dock melts into its edge in either mode", () => {
    expect(
      dockShoulder({
        anchor: "left",
        isDragging: false,
        mode: "compact",
        presentation: "docked",
      })
    ).toBeGreaterThan(0);
    expect(
      dockShoulder({
        anchor: "right",
        isDragging: false,
        mode: "actions",
        presentation: "docked",
      })
    ).toBeGreaterThan(0);
  });

  // the top handle is a 5px sliver — shoulders would eat it whole
  test("only the opened surface melts into a top or bottom edge", () => {
    expect(
      dockShoulder({
        anchor: "top",
        isDragging: false,
        mode: "compact",
        presentation: "docked",
      })
    ).toBe(0);
    expect(
      dockShoulder({
        anchor: "bottom",
        isDragging: false,
        mode: "actions",
        presentation: "docked",
      })
    ).toBeGreaterThan(0);
  });

  // a bar reaching over the notch reads as the cut-out stretched — shoulders would pinch it back
  test("a floating bar over the notch hangs off no edge", () => {
    expect(
      dockShoulder({
        anchor: "top",
        isDragging: false,
        mode: "recording",
        presentation: "bar",
      })
    ).toBe(0);
  });

  test("a lifted island hangs off nothing", () => {
    expect(
      dockShoulder({
        anchor: "left",
        isDragging: true,
        mode: "actions",
        presentation: "docked",
      })
    ).toBe(0);
  });
});

describe("dock silhouette", () => {
  // a shoulderless surface still traces its own box: motion interpolates path to path, never path to none
  test("a surface with no shoulder traces its own box", () => {
    expect(
      dockSilhouettePath({ anchor: "top", height: 40, shoulder: 0, width: 128 })
    ).toBe(
      'path("M 0 0 C 0 0 0 0 0 0 L 0 40 C 0 40 0 40 0 40 L 128 40 C 128 40 128 40 128 40 L 128 0 C 128 0 128 0 128 0 Z")'
    );
  });

  test("a top-anchored surface curves into both top corners", () => {
    expect(
      dockSilhouettePath({
        anchor: "top",
        height: 40,
        shoulder: 10,
        width: 128,
      })
    ).toBe(
      'path("M 0 0 C 5.523 0 10 4.477 10 10 L 10 30 C 10 35.523 14.477 40 20 40 L 108 40 C 113.523 40 118 35.523 118 30 L 118 10 C 118 4.477 122.477 0 128 0 Z")'
    );
  });

  test("a bottom-anchored surface mirrors the top one", () => {
    expect(
      dockSilhouettePath({
        anchor: "bottom",
        height: 40,
        shoulder: 10,
        width: 128,
      })
    ).toBe(
      'path("M 0 40 C 5.523 40 10 35.523 10 30 L 10 10 C 10 4.477 14.477 0 20 0 L 108 0 C 113.523 0 118 4.477 118 10 L 118 30 C 118 35.523 122.477 40 128 40 Z")'
    );
  });

  test("a left-anchored surface runs its shoulders down the left edge", () => {
    expect(
      dockSilhouettePath({
        anchor: "left",
        height: 104,
        shoulder: 10,
        width: 32,
      })
    ).toBe(
      'path("M 0 0 C 0 5.523 4.477 10 10 10 L 22 10 C 27.523 10 32 14.477 32 20 L 32 84 C 32 89.523 27.523 94 22 94 L 10 94 C 4.477 94 0 98.477 0 104 Z")'
    );
  });

  test("a right-anchored surface mirrors the left one", () => {
    expect(
      dockSilhouettePath({
        anchor: "right",
        height: 104,
        shoulder: 10,
        width: 32,
      })
    ).toBe(
      'path("M 32 0 C 32 5.523 27.523 10 22 10 L 10 10 C 4.477 10 0 14.477 0 20 L 0 84 C 0 89.523 4.477 94 10 94 L 22 94 C 27.523 94 32 98.477 32 104 Z")'
    );
  });

  // the island morphs through sizes far below its resting box — a shoulder must never cross itself
  test("shoulders shrink with a surface too small to hold them", () => {
    expect(
      dockSilhouettePath({ anchor: "top", height: 5, shoulder: 10, width: 38 })
    ).toBe(
      'path("M 0 0 C 1.381 0 2.5 1.119 2.5 2.5 L 2.5 2.5 C 2.5 3.881 3.619 5 5 5 L 33 5 C 34.381 5 35.5 3.881 35.5 2.5 L 35.5 2.5 C 35.5 1.119 36.619 0 38 0 Z")'
    );
  });

  test("an unlaid-out surface is left unclipped", () => {
    expect(
      dockSilhouettePath({ anchor: "top", height: 0, shoulder: 10, width: 128 })
    ).toBe("none");
    expect(
      dockSilhouettePath({ anchor: "top", height: 40, shoulder: 10, width: 0 })
    ).toBe("none");
  });
});
