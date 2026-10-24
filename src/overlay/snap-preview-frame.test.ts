import { describe, expect, test } from "bun:test";
import {
  previewGlides,
  SnapPreviewPayloadSchema,
} from "@/overlay/snap-preview-frame";

const RIGHT_DOCK = {
  anchor: "right",
  height: 228,
  width: 40,
  x: 1400,
  y: 336,
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
        width: 228,
        x: 606,
        y: 0,
      })
    ).toBe(true);
  });

  test("the first frame of a drag appears where it lands", () => {
    expect(previewGlides(null, RIGHT_DOCK)).toBe(false);
  });
});
