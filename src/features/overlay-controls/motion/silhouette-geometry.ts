/// Edge space: `along` runs the anchored screen edge, `depth` grows away from it.
export interface EdgePoint {
  along: number;
  depth: number;
}

export interface EdgeCircle {
  center: EdgePoint;
  radius: number;
}

export type EdgeCurve = readonly [EdgePoint, EdgePoint, EdgePoint];

const FULL_TURN = Math.PI * 2;

export const pointOnCircle = (
  circle: EdgeCircle,
  angle: number
): EdgePoint => ({
  along: circle.center.along + circle.radius * Math.cos(angle),
  depth: circle.center.depth + circle.radius * Math.sin(angle),
});

export const angleBetween = (from: EdgePoint, to: EdgePoint) =>
  Math.atan2(to.depth - from.depth, to.along - from.along);

/// Rewinds `to` by whole turns so the sweep from `from` runs the requested way round.
export const sweepTarget = (
  from: number,
  to: number,
  direction: "clockwise" | "counterclockwise"
) => {
  let target = to;
  if (direction === "counterclockwise") {
    while (target < from) {
      target += FULL_TURN;
    }
    return target;
  }
  while (target > from) {
    target -= FULL_TURN;
  }
  return target;
};

// one cubic per arc: sweeps stay under ~150°, where the radial error is a fraction of a pixel
export const arcCurve = (
  circle: EdgeCircle,
  from: number,
  to: number
): EdgeCurve => {
  const handle = (4 / 3) * Math.tan((to - from) / 4) * circle.radius;
  const start = pointOnCircle(circle, from);
  const end = pointOnCircle(circle, to);
  return [
    {
      along: start.along - handle * Math.sin(from),
      depth: start.depth + handle * Math.cos(from),
    },
    {
      along: end.along + handle * Math.sin(to),
      depth: end.depth - handle * Math.cos(to),
    },
    end,
  ];
};

/// Concave blend kissing both circles from the side away from the screen edge — null when they sit too far apart.
export const filletBetween = (
  first: EdgeCircle,
  second: EdgeCircle,
  radius: number
): EdgeCircle | null => {
  const reachFirst = first.radius + radius;
  const reachSecond = second.radius + radius;
  const alongGap = second.center.along - first.center.along;
  const depthGap = second.center.depth - first.center.depth;
  const distance = Math.hypot(alongGap, depthGap);
  if (
    distance === 0 ||
    distance > reachFirst + reachSecond ||
    distance < Math.abs(reachFirst - reachSecond)
  ) {
    return null;
  }
  const foot =
    (distance ** 2 + reachFirst ** 2 - reachSecond ** 2) / (2 * distance);
  const rise = Math.sqrt(Math.max(0, reachFirst ** 2 - foot ** 2));
  const unitAlong = alongGap / distance;
  const unitDepth = depthGap / distance;
  const awayFromEdge = unitAlong >= 0 ? 1 : -1;
  return {
    center: {
      along:
        first.center.along + foot * unitAlong - rise * unitDepth * awayFromEdge,
      depth:
        first.center.depth + foot * unitDepth + rise * unitAlong * awayFromEdge,
    },
    radius,
  };
};

/// Concave flare from a circle back onto the screen edge, landing exactly at `along`.
export const edgeFilletLandingAt = (
  circle: EdgeCircle,
  along: number
): EdgeCircle => {
  const reach = along - circle.center.along;
  const lift = circle.center.depth;
  const radius =
    (reach ** 2 + lift ** 2 - circle.radius ** 2) /
    (2 * (circle.radius + lift));
  return { center: { along, depth: radius }, radius };
};
