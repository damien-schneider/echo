import { describe, expect, test } from "bun:test";
import {
  previewFrameVars,
  previewGlides,
  SnapPreviewPayloadSchema,
} from "@/overlay/snap-preview-frame";

const RIGHT_DOCK = {
  anchor: "right",
  height: 104,
  width: 32,
  x: 1408,
  y: 398,
} as const;

describe("snap preview payloads", () => {
  test("a native frame becomes the placeholder position", () => {
    expect(SnapPreviewPayloadSchema.parse(RIGHT_DOCK)).toEqual(RIGHT_DOCK);
  });

  test("payloads from outside the drag session are rejected", () => {
    expect(SnapPreviewPayloadSchema.safeParse(null).success).toBe(false);
    expect(
      SnapPreviewPayloadSchema.safeParse({ ...RIGHT_DOCK, anchor: "center" })
        .success
    ).toBe(false);
    expect(
      SnapPreviewPayloadSchema.safeParse({ ...RIGHT_DOCK, width: "32" }).success
    ).toBe(false);
    expect(
      SnapPreviewPayloadSchema.safeParse({ ...RIGHT_DOCK, mode: "actions" })
        .success
    ).toBe(false);
  });

  // the placeholder stands in for a docked island, so it wears the same silhouette
  test("the frame travels through custom properties", () => {
    expect(previewFrameVars(RIGHT_DOCK)).toEqual({
      "--preview-clip":
        'path("M 32 0 C 32 5.523 27.523 10 22 10 L 10 10 C 4.477 10 0 14.477 0 20 L 0 84 C 0 89.523 4.477 94 10 94 L 22 94 C 27.523 94 32 98.477 32 104 Z")',
      "--preview-height": "104px",
      "--preview-width": "32px",
      "--preview-x": "1408px",
      "--preview-y": "398px",
    });
  });
});

describe("snap preview motion", () => {
  test("sliding along one edge follows the pointer without animating", () => {
    expect(previewGlides(RIGHT_DOCK, { ...RIGHT_DOCK, y: 520 })).toBe(false);
  });

  test("a new dock edge earns the morph between silhouettes", () => {
    expect(
      previewGlides(RIGHT_DOCK, {
        anchor: "top",
        height: 40,
        width: 128,
        x: 656,
        y: 0,
      })
    ).toBe(true);
  });

  test("the first frame of a drag appears where it lands", () => {
    expect(previewGlides(null, RIGHT_DOCK)).toBe(false);
  });
});
