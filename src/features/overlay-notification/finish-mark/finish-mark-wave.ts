import { REST_LINE } from "@/features/overlay-notification/finish-mark/finish-mark-path";

type Point = readonly [number, number];

const CHECK: readonly [Point, Point, Point] = [
  [7, 12.5],
  [10.25, 15.75],
  [17, 9],
];
const SAMPLES = 33;
const WAVE_CYCLES = 1.5;
const CHECK_PATH = `M${CHECK.map((point) => point.join(" ")).join("L")}`;

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

const between = (from: Point, to: Point, amount: number): Point => [
  lerp(from[0], to[0], amount),
  lerp(from[1], to[1], amount),
];

const lengthOf = (from: Point, to: Point) =>
  Math.hypot(to[0] - from[0], to[1] - from[1]);

const SHORT_LEG = lengthOf(CHECK[0], CHECK[1]);
const CORNER_SAMPLE = Math.round(
  ((SAMPLES - 1) * SHORT_LEG) / (SHORT_LEG + lengthOf(CHECK[1], CHECK[2]))
);

const checkPoint = (sample: number): Point =>
  sample <= CORNER_SAMPLE
    ? between(CHECK[0], CHECK[1], sample / CORNER_SAMPLE)
    : between(
        CHECK[1],
        CHECK[2],
        (sample - CORNER_SAMPLE) / (SAMPLES - 1 - CORNER_SAMPLE)
      );

const wavePoint = (sample: number, amplitude: number, phase: number): Point => {
  const along = sample / (SAMPLES - 1);
  const [x] = between(REST_LINE[0], REST_LINE[1], along);
  const swing =
    Math.sin(Math.PI * along) *
    Math.sin(2 * Math.PI * (WAVE_CYCLES * along - phase));
  return [x, REST_LINE[0][1] + amplitude * swing];
};

interface LiveMarkShape {
  amplitude: number;
  fold: number;
  phase: number;
}

export const liveMarkPath = ({ amplitude, fold, phase }: LiveMarkShape) => {
  if (fold === 1) {
    return CHECK_PATH;
  }
  const points = Array.from({ length: SAMPLES }, (_, sample) =>
    between(wavePoint(sample, amplitude, phase), checkPoint(sample), fold)
  );
  return `M${points.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join("L")}`;
};
