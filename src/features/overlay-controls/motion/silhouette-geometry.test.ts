import { describe, expect, test } from "bun:test";
import {
  arcCurve,
  type EdgeCircle,
  type EdgePoint,
  edgeFilletLandingAt,
  filletBetween,
  pointOnCircle,
} from "@/features/overlay-controls/motion/silhouette-geometry";

const distance = (from: EdgePoint, to: EdgePoint) =>
  Math.hypot(to.along - from.along, to.depth - from.depth);

const PANEL_CORNER: EdgeCircle = {
  center: { along: 0, depth: 20 },
  radius: 20,
};
const GEAR: EdgeCircle = { center: { along: 64, depth: 20 }, radius: 18 };

describe("silhouette geometry", () => {
  test("a neck fillet kisses both circles from the side away from the edge", () => {
    const neck = filletBetween(PANEL_CORNER, GEAR, 16);
    if (!neck) {
      throw new Error("expected a fillet between overlapping reaches");
    }
    expect(distance(neck.center, PANEL_CORNER.center)).toBeCloseTo(36, 9);
    expect(distance(neck.center, GEAR.center)).toBeCloseTo(34, 9);
    expect(neck.center.depth).toBeGreaterThan(GEAR.center.depth);
  });

  test("circles too far apart for the fillet get none", () => {
    expect(filletBetween(PANEL_CORNER, GEAR, 2)).toBeNull();
  });

  test("an edge flare touches down exactly where asked and kisses the circle", () => {
    const flare = edgeFilletLandingAt(GEAR, 94);
    expect(flare.center.along).toBe(94);
    expect(flare.center.depth).toBe(flare.radius);
    expect(distance(flare.center, GEAR.center)).toBeCloseTo(
      GEAR.radius + flare.radius,
      9
    );
  });

  // one cubic per arc must still read as a circle at the sweeps the dock uses
  test("an arc stays within a tenth of a pixel of its circle", () => {
    const from = Math.PI;
    const to = Math.PI * 1.8;
    const start = pointOnCircle(GEAR, from);
    const [first, second, end] = arcCurve(GEAR, from, to);
    const middle = {
      along: (start.along + 3 * first.along + 3 * second.along + end.along) / 8,
      depth: (start.depth + 3 * first.depth + 3 * second.depth + end.depth) / 8,
    };
    expect(distance(end, pointOnCircle(GEAR, to))).toBeCloseTo(0, 9);
    expect(Math.abs(distance(middle, GEAR.center) - GEAR.radius)).toBeLessThan(
      0.1
    );
  });
});
