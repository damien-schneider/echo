import { describe, expect, test } from "bun:test";
import {
  DOCK_GEAR_DIAMETER,
  DOCK_GEAR_SLOT,
  DOCK_SHOULDER,
  dockShoulder,
  dockSilhouettePath,
} from "@/features/overlay-controls/motion/dock-silhouette";

interface PathPoint {
  x: number;
  y: number;
}

const NOT_A_COMMAND = /[^MCLZ]/g;
const SEGMENT_START = /(?=[MCL])/;

const commandsOf = (path: string) => path.replace(NOT_A_COMMAND, "");

// on-curve points only: control points may bow past the outline they shape
const endpointsOf = (path: string): PathPoint[] =>
  path
    .slice('path("'.length, -'")'.length)
    .split(SEGMENT_START)
    .map((segment) => {
      const numbers = segment
        .replace("Z", "")
        .slice(1)
        .trim()
        .split(" ")
        .map(Number);
      return {
        x: numbers.at(-2) ?? Number.NaN,
        y: numbers.at(-1) ?? Number.NaN,
      };
    });

const SIDE_DOCK = { anchor: "right", height: 228, width: 40 } as const;
const PANEL_END = SIDE_DOCK.height - DOCK_GEAR_SLOT;
const tucked = dockSilhouettePath({
  ...SIDE_DOCK,
  gear: { revealed: false, slot: DOCK_GEAR_SLOT },
  shoulder: DOCK_SHOULDER,
});
const revealed = dockSilhouettePath({
  ...SIDE_DOCK,
  gear: { revealed: true, slot: DOCK_GEAR_SLOT },
  shoulder: DOCK_SHOULDER,
});
const lifted = dockSilhouettePath({
  ...SIDE_DOCK,
  corner: 999,
  gear: { revealed: true, slot: DOCK_GEAR_SLOT },
  shoulder: 0,
});
const sliver = dockSilhouettePath({
  anchor: "top",
  height: 5,
  shoulder: DOCK_SHOULDER,
  width: 38,
});

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
  // motion interpolates path to path: a differing command list would snap mid-morph
  test("every state draws the same commands", () => {
    const box = dockSilhouettePath({
      anchor: "top",
      height: 40,
      shoulder: 0,
      width: 116,
    });
    for (const path of [revealed, lifted, sliver, box]) {
      expect(commandsOf(path)).toBe(commandsOf(tucked));
    }
  });

  test("a tucked lobe leaves the slot past the panel empty", () => {
    const reach = Math.max(...endpointsOf(tucked).map((point) => point.y));
    expect(reach).toBe(PANEL_END);
  });

  test("a revealed lobe stands out past the panel and lands back on the edge", () => {
    const lobe = endpointsOf(revealed).filter((point) => point.y > PANEL_END);
    const depth = Math.max(...lobe.map((point) => SIDE_DOCK.width - point.x));
    expect(depth).toBeGreaterThanOrEqual(DOCK_GEAR_DIAMETER);
    expect(lobe.at(-1)).toEqual({ x: SIDE_DOCK.width, y: SIDE_DOCK.height });
  });

  test("a lifted toolbar never shows the lobe", () => {
    expect(lifted).toBe(
      dockSilhouettePath({
        ...SIDE_DOCK,
        corner: 999,
        gear: { revealed: false, slot: DOCK_GEAR_SLOT },
        shoulder: 0,
      })
    );
  });

  test("the outline never leaves its frame", () => {
    const frames = [
      { height: 228, path: tucked, width: 40 },
      { height: 228, path: revealed, width: 40 },
      { height: 228, path: lifted, width: 40 },
      { height: 5, path: sliver, width: 38 },
    ];
    for (const { height, path, width } of frames) {
      for (const point of endpointsOf(path)) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(width);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(height);
      }
    }
  });

  // the island morphs through sizes far below its resting box — a shoulder must never cross itself
  test("a docked outline never doubles back along its edge", () => {
    const runs = [
      endpointsOf(tucked).map((point) => point.y),
      endpointsOf(revealed).map((point) => point.y),
      endpointsOf(sliver).map((point) => point.x),
    ];
    for (const run of runs) {
      expect(run).toEqual(run.toSorted((first, second) => first - second));
    }
  });

  test("right and bottom anchors mirror left and top", () => {
    const mirrors = [
      { from: "left", height: 228, to: "right", width: 40 },
      { from: "top", height: 40, to: "bottom", width: 228 },
    ] as const;
    for (const { from, height, to, width } of mirrors) {
      const options = {
        gear: { revealed: true, slot: DOCK_GEAR_SLOT },
        height,
        shoulder: DOCK_SHOULDER,
        width,
      };
      const source = endpointsOf(
        dockSilhouettePath({ ...options, anchor: from })
      );
      const mirrored = endpointsOf(
        dockSilhouettePath({ ...options, anchor: to })
      );
      const flip = (point: PathPoint) =>
        to === "right"
          ? { x: width - point.x, y: point.y }
          : { x: point.x, y: height - point.y };
      expect(mirrored.map(flip)).toEqual(source);
    }
  });

  test("a surface with no shoulder traces its own box", () => {
    const corners = endpointsOf(
      dockSilhouettePath({ anchor: "top", height: 40, shoulder: 0, width: 116 })
    ).map(({ x, y }) => `${x},${y}`);
    expect(new Set(corners)).toEqual(
      new Set(["0,0", "0,40", "116,40", "116,0"])
    );
  });

  test("a frame too short for the lobe spends all of it on the panel", () => {
    const path = dockSilhouettePath({
      anchor: "top",
      gear: { revealed: true, slot: DOCK_GEAR_SLOT },
      height: 5,
      shoulder: DOCK_SHOULDER,
      width: 38,
    });
    expect(path).toBe(sliver);
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
