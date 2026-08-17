import { describe, expect, it } from "bun:test";
import {
  bridgeToNotch,
  islandFrame,
  type OverlaySurface,
  OverlaySurfaceSchema,
  spanTheNotch,
  toScreenBox,
} from "@/features/overlay-controls/runtime/overlay-surface";

const surface = {
  anchor: "top",
  island: { height: 88, width: 326, x: 4, y: 36 },
  notch: { height: 32, width: 196, x: 69 },
  presentation: "bar",
  window: { x: 589, y: 0 },
} as const satisfies OverlaySurface;

describe("overlay surface schema", () => {
  it("accepts a notched top surface and a disabled overlay", () => {
    expect(OverlaySurfaceSchema.safeParse(surface).success).toBe(true);
    expect(OverlaySurfaceSchema.safeParse(null).success).toBe(true);
  });

  it("rejects malformed geometry instead of rendering it", () => {
    expect(
      OverlaySurfaceSchema.safeParse({ ...surface, island: { height: 1 } })
        .success
    ).toBe(false);
    expect(
      OverlaySurfaceSchema.safeParse({
        ...surface,
        window: { x: Number.NaN, y: 0 },
      }).success
    ).toBe(false);
    expect(
      OverlaySurfaceSchema.safeParse({ ...surface, anchor: "middle" }).success
    ).toBe(false);
    expect(
      OverlaySurfaceSchema.safeParse({ ...surface, extra: 1 }).success
    ).toBe(false);
  });

  it("keeps a null notch for screens without one", () => {
    const parsed = OverlaySurfaceSchema.safeParse({ ...surface, notch: null });

    expect(parsed.success && parsed.data?.notch).toBe(null);
  });
});

describe("island screen box", () => {
  it("stays identical when only the window frame grows around it", () => {
    const settled = toScreenBox(surface.island, surface.window);
    const duringTransition = toScreenBox(
      { ...surface.island, x: 104, y: 36 },
      { x: 489, y: 0 }
    );

    expect(duringTransition).toEqual(settled);
  });

  it("moves with the island itself", () => {
    expect(toScreenBox(surface.island, { x: 600, y: 0 }).x).toBe(604);
  });
});

describe("island frame", () => {
  const box = { height: 100, width: 300, x: 10, y: 20 };

  it("fills the reserved box when nothing has been measured yet", () => {
    expect(islandFrame({ anchor: "top", box, size: null })).toEqual(box);
  });

  it("hangs content off the anchored edge", () => {
    const size = { height: 40, width: 100 };

    expect(islandFrame({ anchor: "top", box, size })).toEqual({
      ...size,
      x: 110,
      y: 20,
    });
    expect(islandFrame({ anchor: "bottom", box, size })).toEqual({
      ...size,
      x: 110,
      y: 80,
    });
    expect(islandFrame({ anchor: "left", box, size })).toEqual({
      ...size,
      x: 10,
      y: 50,
    });
    expect(islandFrame({ anchor: "right", box, size })).toEqual({
      ...size,
      x: 210,
      y: 50,
    });
  });

  it("never lets measured content spill outside the reserved box", () => {
    const frame = islandFrame({
      anchor: "top",
      box,
      size: { height: 400, width: 900 },
    });

    expect(frame).toEqual(box);
  });
});

describe("notch bridge", () => {
  const wide = toScreenBox(surface.island, surface.window);

  it("grows a covering surface up to the screen top", () => {
    expect(bridgeToNotch(wide, surface)).toEqual({
      frame: { height: 124, width: 326, x: 593, y: 0 },
      strip: 36,
    });
  });

  it("leaves a surface narrower than the cut-out floating below it", () => {
    const pill = toScreenBox(
      { height: 5, width: 38, x: 148, y: 36 },
      surface.window
    );

    expect(bridgeToNotch(pill, surface)).toEqual({ frame: pill, strip: 0 });
  });

  it("only bridges the top of a screen that has a notch", () => {
    expect(bridgeToNotch(wide, { ...surface, notch: null })).toEqual({
      frame: wide,
      strip: 0,
    });
    expect(bridgeToNotch(wide, { ...surface, anchor: "bottom" })).toEqual({
      frame: wide,
      strip: 0,
    });
  });

  it("keeps the content clear of the notch it now reaches over", () => {
    const bridged = bridgeToNotch(wide, surface);

    expect(bridged.frame.y + bridged.strip).toBe(wide.y);
    expect(bridged.frame.height - bridged.strip).toBe(wide.height);
  });
});

describe("notch span", () => {
  const box = { height: 88, width: 326, x: 593, y: 36 };

  it("widens a narrow surface until the cut-out is covered", () => {
    const badge = { height: 52, width: 176, x: 668, y: 36 };

    expect(spanTheNotch(badge, box, surface)).toEqual({
      height: 52,
      width: 196,
      x: 658,
      y: 36,
    });
  });

  it("leaves a surface that already reaches past the cut-out alone", () => {
    const bar = { height: 52, width: 320, x: 596, y: 36 };

    expect(spanTheNotch(bar, box, surface)).toEqual(bar);
  });

  // widening past the reserved box would draw outside the native window
  it("never widens past the box the surface was given", () => {
    const badge = { height: 52, width: 176, x: 668, y: 36 };
    const wide = { ...surface, notch: { height: 32, width: 400, x: 69 } };

    expect(spanTheNotch(badge, box, wide)).toEqual({
      height: 52,
      width: 326,
      x: 593,
      y: 36,
    });
  });

  it("leaves a surface with no cut-out above it where it sits", () => {
    const badge = { height: 52, width: 176, x: 668, y: 36 };

    expect(spanTheNotch(badge, box, { ...surface, notch: null })).toEqual(
      badge
    );
    expect(spanTheNotch(badge, box, { ...surface, anchor: "bottom" })).toEqual(
      badge
    );
  });
});
