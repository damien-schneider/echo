import { describe, expect, it } from "bun:test";
import {
  DOCK_SHOULDER,
  dockSilhouettePath,
} from "@/features/overlay-controls/motion/dock-silhouette";
import { notchEntry } from "@/features/overlay-controls/motion/notch-entry";
import type { OverlaySurface } from "@/features/overlay-controls/runtime/overlay-surface";

const surface = {
  anchor: "top",
  island: { height: 88, width: 326, x: 4, y: 36 },
  notch: { height: 32, width: 196, x: 69 },
  presentation: "bar",
  window: { x: 589, y: 0 },
} as const satisfies OverlaySurface;

describe("notch entry", () => {
  it("is born inside the notch, in screen coordinates", () => {
    expect(notchEntry(surface)).toEqual({
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      clipPath: dockSilhouettePath({
        anchor: "top",
        height: 32,
        shoulder: DOCK_SHOULDER,
        width: 196,
      }),
      height: 32,
      width: 196,
      x: 658,
      y: 0,
    });
  });

  // the exit replays the entry: without a path of its own the shoulders would freeze mid-fold
  it("folds the shoulders back into the seam it came from", () => {
    expect(notchEntry({ ...surface, notch: null }).clipPath).toBe(
      dockSilhouettePath({
        anchor: "top",
        height: 6,
        shoulder: DOCK_SHOULDER,
        width: 104,
      })
    );
  });

  it("uses a seam at the top edge on a screen without a notch", () => {
    const entry = notchEntry({ ...surface, notch: null });

    expect(entry.y).toBe(0);
    expect(entry.height).toBe(6);
    expect(entry.width).toBe(104);
    // Centred on the island it grows into, so only the size travels.
    expect(Number(entry.x) + 104 / 2).toBe(589 + 4 + 326 / 2);
    expect(entry.borderTopLeftRadius).toBe(0);
    expect(entry.borderBottomLeftRadius).toBe(3);
  });

  it("never rounds a corner wider than the box it belongs to", () => {
    const entry = notchEntry({
      ...surface,
      notch: { height: 8, width: 196, x: 69 },
    });

    expect(entry.borderBottomLeftRadius).toBe(4);
  });
});
