import { describe, expect, test } from "bun:test";
import {
  DOCK_GEAR_DIAMETER,
  DOCK_GEAR_REACH,
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

const subpathsOf = (path: string) =>
  path
    .slice('path("'.length, -'")'.length)
    .split("Z")
    .map((subpath) => subpath.trim())
    .filter((subpath) => subpath.length > 0);

// on-curve points only: control points may bow past the outline they shape
const pointsOf = (subpath: string): PathPoint[] =>
  subpath.split(SEGMENT_START).map((segment) => {
    const numbers = segment.slice(1).trim().split(" ").map(Number);
    return {
      x: numbers.at(-2) ?? Number.NaN,
      y: numbers.at(-1) ?? Number.NaN,
    };
  });

const outlineOf = (path: string) => pointsOf(subpathsOf(path)[0] ?? "");
const bubbleOf = (path: string) => pointsOf(subpathsOf(path)[1] ?? "");
const everyPointOf = (path: string) => subpathsOf(path).flatMap(pointsOf);

// shoelace over the on-curve points: the sign is the winding
const signedArea = (points: PathPoint[]) =>
  points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

const SIDE_DOCK = { anchor: "right", height: 228, width: 40 } as const;
const PANEL_END = SIDE_DOCK.height - DOCK_GEAR_SLOT;
const tucked = dockSilhouettePath({
  ...SIDE_DOCK,
  gear: { revealed: false },
  shoulder: DOCK_SHOULDER,
});
const revealed = dockSilhouettePath({
  ...SIDE_DOCK,
  gear: { revealed: true },
  shoulder: DOCK_SHOULDER,
});
const lifted = dockSilhouettePath({
  ...SIDE_DOCK,
  corner: 999,
  gear: { revealed: true },
  isLifted: true,
  shoulder: DOCK_SHOULDER,
});
const sliver = dockSilhouettePath({
  anchor: "top",
  height: 5,
  shoulder: DOCK_SHOULDER,
  width: 38,
});

const FLOATING = {
  anchor: "bottom",
  corner: 999,
  height: 40,
  width: 176,
} as const;
const PILL_END = FLOATING.width - DOCK_GEAR_REACH - DOCK_GEAR_DIAMETER / 2;
const floatingTucked = dockSilhouettePath({
  ...FLOATING,
  gear: { revealed: false },
  shoulder: 0,
});
const floatingRevealed = dockSilhouettePath({
  ...FLOATING,
  gear: { revealed: true },
  shoulder: 0,
});

describe("dock shoulder", () => {
  test("a bar hangs off no edge", () => {
    expect(dockShoulder({ anchor: "top", presentation: "bar" })).toBe(0);
  });

  test("a side dock melts into its edge", () => {
    for (const anchor of ["left", "right"] as const) {
      expect(dockShoulder({ anchor, presentation: "docked" })).toBe(
        DOCK_SHOULDER
      );
    }
  });

  test("a top or bottom dock floats free of its edge", () => {
    for (const anchor of ["top", "bottom"] as const) {
      expect(dockShoulder({ anchor, presentation: "docked" })).toBe(0);
    }
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
    for (const path of [
      revealed,
      lifted,
      sliver,
      box,
      floatingTucked,
      floatingRevealed,
    ]) {
      expect(commandsOf(path)).toBe(commandsOf(tucked));
    }
  });

  test("a tucked lobe leaves the slot past the panel empty", () => {
    const reach = Math.max(...everyPointOf(tucked).map((point) => point.y));
    expect(reach).toBe(PANEL_END);
  });

  test("a revealed lobe stands out past the panel and lands back on the edge", () => {
    const lobe = outlineOf(revealed).filter((point) => point.y > PANEL_END);
    const depth = Math.max(...lobe.map((point) => SIDE_DOCK.width - point.x));
    expect(depth).toBeGreaterThanOrEqual(DOCK_GEAR_DIAMETER);
    expect(lobe.at(-1)).toEqual({ x: SIDE_DOCK.width, y: SIDE_DOCK.height });
  });

  test("a lifted toolbar never shows the lobe", () => {
    expect(lifted).toBe(
      dockSilhouettePath({
        ...SIDE_DOCK,
        corner: 999,
        gear: { revealed: false },
        isLifted: true,
        shoulder: DOCK_SHOULDER,
      })
    );
  });

  // the shoulders fold away, they don't turn into extra panel past the end buttons
  test("a lifted island keeps the length it had docked", () => {
    const along = outlineOf(lifted).map((point) => point.y);
    expect(Math.min(...along)).toBe(DOCK_SHOULDER);
    expect(Math.max(...along)).toBe(PANEL_END - DOCK_SHOULDER);
  });

  test("a floating toolbar splits its gear off as a bubble beside the pill", () => {
    const pill = outlineOf(floatingRevealed).map((point) => point.x);
    const bubble = bubbleOf(floatingRevealed);
    const across = bubble.map((point) => point.y);
    expect(Math.max(...pill)).toBe(PILL_END);
    expect(Math.min(...bubble.map((point) => point.x))).toBeGreaterThan(
      PILL_END
    );
    expect(Math.max(...bubble.map((point) => point.x))).toBe(FLOATING.width);
    expect(Math.max(...across) - Math.min(...across)).toBe(DOCK_GEAR_DIAMETER);
  });

  test("a tucked bubble waits inside the pill it grows out of", () => {
    expect(outlineOf(floatingTucked)).toEqual(outlineOf(floatingRevealed));
    for (const point of bubbleOf(floatingTucked)) {
      expect(point.x).toBeLessThan(PILL_END);
    }
  });

  // nonzero fill: a bubble wound the other way would punch a hole where it crosses the pill
  test("the bubble winds like the pill, so the two merge while it splits off", () => {
    expect(Math.sign(signedArea(bubbleOf(floatingRevealed)))).toBe(
      Math.sign(signedArea(outlineOf(floatingRevealed)))
    );
  });

  test("a lifted floating toolbar tucks its bubble", () => {
    expect(
      dockSilhouettePath({
        ...FLOATING,
        gear: { revealed: true },
        isLifted: true,
        shoulder: 0,
      })
    ).toBe(floatingTucked);
  });

  test("the outline never leaves its frame", () => {
    const frames = [
      { height: 228, path: tucked, width: 40 },
      { height: 228, path: revealed, width: 40 },
      { height: 228, path: lifted, width: 40 },
      { height: 5, path: sliver, width: 38 },
      { height: 40, path: floatingTucked, width: 176 },
      { height: 40, path: floatingRevealed, width: 176 },
    ];
    for (const { height, path, width } of frames) {
      for (const point of everyPointOf(path)) {
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
      outlineOf(tucked).map((point) => point.y),
      outlineOf(revealed).map((point) => point.y),
      outlineOf(sliver).map((point) => point.x),
    ];
    for (const run of runs) {
      expect(run).toEqual(run.toSorted((first, second) => first - second));
    }
  });

  test("right and bottom anchors mirror left and top", () => {
    const mirrors = [
      {
        from: "left",
        height: 228,
        shoulder: DOCK_SHOULDER,
        to: "right",
        width: 40,
      },
      { from: "top", height: 40, shoulder: 0, to: "bottom", width: 176 },
    ] as const;
    for (const { from, height, shoulder, to, width } of mirrors) {
      const options = {
        corner: 999,
        gear: { revealed: true },
        height,
        shoulder,
        width,
      };
      const source = everyPointOf(
        dockSilhouettePath({ ...options, anchor: from })
      );
      const mirrored = everyPointOf(
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
    const corners = outlineOf(
      dockSilhouettePath({ anchor: "top", height: 40, shoulder: 0, width: 116 })
    ).map(({ x, y }) => `${x},${y}`);
    expect(new Set(corners)).toEqual(
      new Set(["0,0", "0,40", "116,40", "116,0"])
    );
  });

  test("a frame too short for the lobe spends all of it on the panel", () => {
    const path = dockSilhouettePath({
      anchor: "top",
      gear: { revealed: true },
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
