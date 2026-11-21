import { describe, expect, it } from "bun:test";
import { REST_LINE } from "@/features/overlay-notification/finish-mark/finish-mark-path";
import { liveMarkPath } from "@/features/overlay-notification/finish-mark/finish-mark-wave";

const pointsOf = (path: string) =>
  path
    .slice(1)
    .split("L")
    .map((pair) => pair.split(" ").map(Number));

describe("liveMarkPath", () => {
  it("lies flat on the line the loader lands on while the voice is silent", () => {
    const points = pointsOf(
      liveMarkPath({ amplitude: 0, fold: 0, phase: 0.3 })
    );

    expect(points[0]).toEqual([...REST_LINE[0]]);
    expect(points.at(-1)).toEqual([...REST_LINE[1]]);
    expect(points.every(([, y]) => y === REST_LINE[0][1])).toBe(true);
  });

  it("swells with the voice yet stays anchored at both ends", () => {
    const quiet = pointsOf(liveMarkPath({ amplitude: 1, fold: 0, phase: 0.2 }));
    const loud = pointsOf(liveMarkPath({ amplitude: 4, fold: 0, phase: 0.2 }));
    const reach = (points: number[][]) =>
      Math.max(...points.map(([, y = 0]) => Math.abs(y - REST_LINE[0][1])));

    expect(reach(loud)).toBeGreaterThan(reach(quiet) * 3);
    expect(reach(loud)).toBeLessThanOrEqual(4);
    expect(loud[0]).toEqual([...REST_LINE[0]]);
    expect(loud.at(-1)).toEqual([...REST_LINE[1]]);
  });

  it("folds into the check with a sharp corner, whatever the wave was doing", () => {
    const points = pointsOf(
      liveMarkPath({ amplitude: 4, fold: 1, phase: 0.6 })
    );

    expect(points[0]).toEqual([7, 12.5]);
    expect(points).toContainEqual([10.25, 15.75]);
    expect(points.at(-1)).toEqual([17, 9]);
  });
});
