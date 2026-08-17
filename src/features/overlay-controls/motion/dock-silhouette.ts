import type { OverlayMode } from "@/features/overlay-controls/recording-overlay-state";
import type {
  OverlayAnchor,
  OverlayPresentation,
} from "@/features/overlay-controls/runtime/overlay-surface";

// circular-arc control handle, so a shoulder reads as a quarter circle
const ARC_HANDLE = 0.5523;
export const DOCK_SHOULDER = 10;

interface EdgePoint {
  along: number;
  depth: number;
}

interface SilhouetteBox {
  anchor: OverlayAnchor;
  height: number;
  width: number;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

// the shoulders run along the anchored edge; depth grows away from the screen
const projectEdgePoint = (box: SilhouetteBox, point: EdgePoint) => {
  if (box.anchor === "bottom") {
    return { x: point.along, y: box.height - point.depth };
  }
  if (box.anchor === "left") {
    return { x: point.depth, y: point.along };
  }
  if (box.anchor === "right") {
    return { x: box.width - point.depth, y: point.along };
  }
  return { x: point.along, y: point.depth };
};

const edgeSpan = (box: SilhouetteBox) =>
  box.anchor === "left" || box.anchor === "right" ? box.height : box.width;

const edgeDepth = (box: SilhouetteBox) =>
  box.anchor === "left" || box.anchor === "right" ? box.width : box.height;

const command = (verb: string, box: SilhouetteBox, points: EdgePoint[]) => {
  const drawn = points
    .map((point) => projectEdgePoint(box, point))
    .map((point) => `${round(point.x)} ${round(point.y)}`)
    .join(" ");
  return `${verb} ${drawn}`;
};

interface ShoulderedEdge {
  depth: number;
  shoulder: number;
  span: number;
}

// border-radius rounds the box; only the path can round the corners the shoulders cut out of it
const silhouetteCommands = (box: SilhouetteBox, edge: ShoulderedEdge) => {
  const { depth, shoulder, span } = edge;
  const handle = shoulder * ARC_HANDLE;
  const far = span - shoulder;
  const floor = depth - shoulder;
  return [
    command("M", box, [{ along: 0, depth: 0 }]),
    command("C", box, [
      { along: handle, depth: 0 },
      { along: shoulder, depth: shoulder - handle },
      { along: shoulder, depth: shoulder },
    ]),
    command("L", box, [{ along: shoulder, depth: floor }]),
    command("C", box, [
      { along: shoulder, depth: floor + handle },
      { along: shoulder * 2 - handle, depth },
      { along: shoulder * 2, depth },
    ]),
    command("L", box, [{ along: span - shoulder * 2, depth }]),
    command("C", box, [
      { along: span - shoulder * 2 + handle, depth },
      { along: far, depth: floor + handle },
      { along: far, depth: floor },
    ]),
    command("L", box, [{ along: far, depth: shoulder }]),
    command("C", box, [
      { along: far, depth: shoulder - handle },
      { along: span - handle, depth: 0 },
      { along: span, depth: 0 },
    ]),
    "Z",
  ].join(" ");
};

interface DockShoulderOptions {
  anchor: OverlayAnchor;
  isDragging: boolean;
  mode: OverlayMode;
  presentation: OverlayPresentation;
}

export const dockShoulder = ({
  anchor,
  isDragging,
  mode,
  presentation,
}: DockShoulderOptions) => {
  if (isDragging) {
    return 0;
  }
  if (presentation !== "docked") {
    return 0;
  }
  if (anchor === "left" || anchor === "right") {
    return DOCK_SHOULDER;
  }
  return mode === "actions" ? DOCK_SHOULDER : 0;
};

interface DockSilhouetteOptions extends SilhouetteBox {
  shoulder: number;
}

/// Concave shoulders melting into the screen edge — the surface reads as attached, not stuck on.
export const dockSilhouettePath = ({
  shoulder,
  ...box
}: DockSilhouetteOptions) => {
  const span = edgeSpan(box);
  const depth = edgeDepth(box);
  if (!(span > 0 && depth > 0)) {
    return "none";
  }
  const fitted = Math.max(0, Math.min(shoulder, depth / 2, span / 4));
  return `path("${silhouetteCommands(box, { depth, shoulder: fitted, span })}")`;
};
