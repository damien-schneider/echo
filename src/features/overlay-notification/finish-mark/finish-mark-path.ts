type Point = readonly [number, number];
type Cubic = readonly [Point, Point, Point, Point];
interface StrokeTarget {
  head: (number | null)[];
  tail: (number | null)[];
}

export const RING_RADIUS = 10.25;
const CENTER = 12;
const LAP = 2 * Math.PI * RING_RADIUS;
const DASH = LAP * 0.28;
const BOTTOM: Point = [CENTER, CENTER + RING_RADIUS];
const TOP: Point = [CENTER, CENTER - RING_RADIUS];
export const REST_LINE: readonly [Point, Point] = [
  [5, CENTER],
  [19, CENTER],
];
const SWOOP: Cubic = [BOTTOM, [5, BOTTOM[1]], [0.5, CENTER], REST_LINE[0]];

const cubicAt = ([p0, p1, p2, p3]: Cubic, t: number): Point => {
  const u = 1 - t;
  const along = (axis: 0 | 1) =>
    u * u * u * p0[axis] +
    3 * u * u * t * p1[axis] +
    3 * u * t * t * p2[axis] +
    t * t * t * p3[axis];
  return [along(0), along(1)];
};

const distance = ([ax, ay]: Point, [bx, by]: Point) =>
  Math.hypot(bx - ax, by - ay);

const cubicLength = (curve: Cubic) => {
  let length = 0;
  let previous = curve[0];
  for (let step = 1; step <= 64; step += 1) {
    const point = cubicAt(curve, step / 64);
    length += distance(previous, point);
    previous = point;
  }
  return length;
};

const SWOOP_END = 2 * LAP + cubicLength(SWOOP);
const LINE_END = SWOOP_END + distance(REST_LINE[0], REST_LINE[1]);
const ARC = `A${RING_RADIUS} ${RING_RADIUS} 0 0 1`;
const LAP_PATH = `${ARC} ${TOP.join(" ")} ${ARC} ${BOTTOM.join(" ")}`;

export const LOADER_PATH = `M${BOTTOM.join(" ")} ${LAP_PATH} ${LAP_PATH} C${SWOOP.slice(1).join(" ")} L${REST_LINE[1].join(" ")}`;

export const PATH_SPAN = Math.ceil(LINE_END);

/// Share of a lap the dash has already run when it appears: a warm model lands it within a quarter turn.
export const ORBIT_LEAD = 0.7;

export const ORBIT: StrokeTarget = {
  head: [LAP, 2 * LAP],
  tail: [LAP - DASH, 2 * LAP - DASH],
};

export const ORBIT_START = {
  head: LAP * (1 + ORBIT_LEAD),
  tail: LAP * (1 + ORBIT_LEAD) - DASH,
};

export const LANDED: StrokeTarget = {
  head: [null, LINE_END],
  tail: [null, SWOOP_END],
};
