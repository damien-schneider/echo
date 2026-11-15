const BAR_WIDTH = 3;
const BAR_GAP = 2;
const BAR_RADIUS = 2;
const BAR_COUNT = 50;
const BAR_STEP = BAR_WIDTH + BAR_GAP;
const WAVEFORM_WIDTH = BAR_COUNT * BAR_STEP - BAR_GAP;
const UNPLAYED_ALPHA = 0.4;

interface WaveformColors {
  active: string;
  inactive: string;
}

interface WaveformBar {
  // <= 0 is unplayed, >= 1 fully played, in between partially played.
  fillRatio: number;
  height: number;
  x: number;
  y: number;
}

// Seeded by src so the same recording always shows the same bars.
export const waveformBars = (src: string) => {
  const seed = src.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const x = Math.sin(seed + i * 137.5) * 10_000;
    return 0.15 + (x - Math.floor(x)) * 0.7;
  });
};

const waveformStartX = (width: number) => (width - WAVEFORM_WIDTH) / 2;

const resolveWaveformColors = (canvas: HTMLCanvasElement): WaveformColors => {
  const style = getComputedStyle(canvas);
  return {
    active: style.getPropertyValue("--color-primary").trim() || "#FAA2CA",
    inactive:
      style.getPropertyValue("--foreground") || "rgba(128, 128, 128, 0.3)",
  };
};

const drawBarShape = (ctx: CanvasRenderingContext2D, bar: WaveformBar) => {
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, BAR_WIDTH, bar.height, BAR_RADIUS);
  ctx.fill();
};

const drawBar = (
  ctx: CanvasRenderingContext2D,
  bar: WaveformBar,
  colors: WaveformColors
) => {
  if (bar.fillRatio >= 1) {
    ctx.fillStyle = colors.active;
    ctx.globalAlpha = 1;
    drawBarShape(ctx, bar);
    return;
  }

  ctx.fillStyle = colors.inactive;
  ctx.globalAlpha = UNPLAYED_ALPHA;
  drawBarShape(ctx, bar);
  if (bar.fillRatio <= 0) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(bar.x, bar.y, BAR_WIDTH * bar.fillRatio, bar.height);
  ctx.clip();
  ctx.fillStyle = colors.active;
  ctx.globalAlpha = 1;
  drawBarShape(ctx, bar);
  ctx.restore();
};

export const drawWaveform = (
  canvas: HTMLCanvasElement,
  bars: number[],
  progress: number
) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const colors = resolveWaveformColors(canvas);
  const startX = waveformStartX(rect.width);

  for (const [i, value] of bars.entries()) {
    const height = Math.max(4, value * rect.height * 0.85);
    const barStart = i / BAR_COUNT;
    const barEnd = (i + 1) / BAR_COUNT;
    drawBar(
      ctx,
      {
        fillRatio: (progress - barStart) / (barEnd - barStart),
        height,
        x: startX + i * BAR_STEP,
        y: rect.height / 2 - height / 2,
      },
      colors
    );
  }

  ctx.globalAlpha = 1;
};

export const timeAtClientX = (
  container: HTMLElement,
  clientX: number,
  duration: number
) => {
  const rect = container.getBoundingClientRect();
  const relativeX = clientX - rect.left - waveformStartX(rect.width);
  return Math.max(0, Math.min(1, relativeX / WAVEFORM_WIDTH)) * duration;
};
