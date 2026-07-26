import { z } from "zod";

const OverlayBoxSchema = z
  .object({
    height: z.number().finite().nonnegative(),
    width: z.number().finite().nonnegative(),
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

const OverlayNotchBoxSchema = z
  .object({
    height: z.number().finite().positive(),
    width: z.number().finite().positive(),
    x: z.number().finite(),
  })
  .strict();

const OverlayWindowOriginSchema = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();

const PresentSurfaceSchema = z
  .object({
    anchor: z.enum(["bottom", "left", "right", "top"]),
    island: OverlayBoxSchema,
    notch: OverlayNotchBoxSchema.nullable(),
    presentation: z.enum(["bar", "docked"]),
    window: OverlayWindowOriginSchema,
  })
  .strict();

export const OverlaySurfaceSchema = PresentSurfaceSchema.nullable();

export type OverlaySurface = z.infer<typeof PresentSurfaceSchema>;
export type OverlayAnchor = OverlaySurface["anchor"];
export type OverlayPresentation = OverlaySurface["presentation"];
export type OverlayBox = z.infer<typeof OverlayBoxSchema>;

export interface IslandSize {
  height: number;
  width: number;
}

// Last resort when the native geometry is unreachable: fill the webview so the
// island still renders instead of vanishing.
export const viewportOverlaySurface = (
  viewport: IslandSize
): OverlaySurface => ({
  anchor: "top",
  island: { height: viewport.height, width: viewport.width, x: 0, y: 0 },
  notch: null,
  presentation: "bar",
  window: { x: 0, y: 0 },
});

// Desktop coordinates: growing the window for a transition shifts the origin
// and the window-local box by the same amount, leaving this invariant.
export const toScreenBox = (
  box: OverlayBox,
  origin: OverlaySurface["window"]
): OverlayBox => ({
  height: box.height,
  width: box.width,
  x: box.x + origin.x,
  y: box.y + origin.y,
});

interface IslandOriginOptions {
  anchor: OverlayAnchor;
  box: OverlayBox;
  size: IslandSize;
}

// Content-sized surfaces hang off the anchored edge of the box Rust reserved.
const islandOrigin = ({ anchor, box, size }: IslandOriginOptions) => {
  const centeredX = box.x + (box.width - size.width) / 2;
  const centeredY = box.y + (box.height - size.height) / 2;
  if (anchor === "top") {
    return { x: centeredX, y: box.y };
  }
  if (anchor === "bottom") {
    return { x: centeredX, y: box.y + box.height - size.height };
  }
  if (anchor === "left") {
    return { x: box.x, y: centeredY };
  }
  return { x: box.x + box.width - size.width, y: centeredY };
};

interface IslandFrameOptions {
  anchor: OverlayAnchor;
  box: OverlayBox;
  size: IslandSize | null;
}

export const islandFrame = ({
  anchor,
  box,
  size,
}: IslandFrameOptions): OverlayBox => {
  const resolved = size ?? { height: box.height, width: box.width };
  const bounded = {
    height: Math.min(resolved.height, box.height),
    width: Math.min(resolved.width, box.width),
  };
  return { ...bounded, ...islandOrigin({ anchor, box, size: bounded }) };
};

export interface BridgedIsland {
  frame: OverlayBox;
  strip: number;
}

const hidesTheCutOut = (island: OverlayBox, left: number, width: number) =>
  island.x <= left && island.x + island.width >= left + width;

// A hardware notch only reads as part of the island when the surface is wide
// enough to hide the cut-out. The frame then grows up to the screen top and
// swallows the strip beside the notch, so the two paint as one shape instead
// of leaving daylight in the corners. Narrower surfaces keep floating below.
export const bridgeToNotch = (
  island: OverlayBox,
  surface: OverlaySurface
): BridgedIsland => {
  const { notch, window: origin } = surface;
  const strip = island.y - origin.y;
  if (!notch || surface.anchor !== "top" || strip <= 0) {
    return { frame: island, strip: 0 };
  }
  if (!hidesTheCutOut(island, notch.x + origin.x, notch.width)) {
    return { frame: island, strip: 0 };
  }
  return {
    frame: { ...island, height: island.height + strip, y: origin.y },
    strip,
  };
};
