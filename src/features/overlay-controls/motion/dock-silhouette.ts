import {
  angleBetween,
  arcCurve,
  type EdgeCircle,
  type EdgeCurve,
  type EdgePoint,
  edgeFilletLandingAt,
  filletBetween,
  pointOnCircle,
  sweepTarget,
} from "@/features/overlay-controls/motion/silhouette-geometry";
import type { OverlayMode } from "@/features/overlay-controls/recording-overlay-state";
import type {
  OverlayAnchor,
  OverlayPresentation,
} from "@/features/overlay-controls/runtime/overlay-surface";

export const DOCK_SHOULDER = 20;
/// Room past the panel for the settings lobe — mirrored by DOCK_GEAR_SLOT in surface.rs.
export const DOCK_GEAR_SLOT = 52;
export const DOCK_GEAR_DIAMETER = 36;
/// Panel end to gear centre; the rest of the slot is the flare back onto the edge.
export const DOCK_GEAR_REACH = 22;
const GEAR_NECK = 16;

const QUARTER = Math.PI / 2;

interface SilhouetteBox {
  anchor: OverlayAnchor;
  height: number;
  width: number;
}

type SilhouetteSegment =
  | { points: EdgeCurve; verb: "C" }
  | { points: readonly [EdgePoint]; verb: "L" | "M" };

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

const drawSegment = (box: SilhouetteBox, segment: SilhouetteSegment) => {
  const drawn = segment.points
    .map((point) => projectEdgePoint(box, point))
    .map((point) => `${round(point.x)} ${round(point.y)}`)
    .join(" ");
  return `${segment.verb} ${drawn}`;
};

const curve = (points: EdgeCurve): SilhouetteSegment => ({
  points,
  verb: "C",
});
const line = (point: EdgePoint): SilhouetteSegment => ({
  points: [point],
  verb: "L",
});
const stay = (point: EdgePoint) => curve([point, point, point]);

interface PanelEdge {
  /// Convex rounding of every corner off the screen edge.
  corner: number;
  depth: number;
  /// Concave flare into the screen; 0 for a surface hanging off nothing.
  shoulder: number;
  span: number;
}

const panelStart = ({
  corner,
  depth,
  shoulder,
}: PanelEdge): SilhouetteSegment[] => {
  const isDocked = shoulder > 0;
  const near: EdgeCircle = isDocked
    ? { center: { along: 0, depth: shoulder }, radius: shoulder }
    : { center: { along: corner, depth: corner }, radius: corner };
  const enter = isDocked ? -QUARTER : 3 * QUARTER;
  const far = {
    center: { along: shoulder + corner, depth: depth - corner },
    radius: corner,
  };
  return [
    { points: [pointOnCircle(near, enter)], verb: "M" },
    curve(arcCurve(near, enter, isDocked ? 0 : Math.PI)),
    line({ along: shoulder, depth: depth - corner }),
    curve(arcCurve(far, Math.PI, QUARTER)),
  ];
};

const farEndCircle = ({ corner, depth, shoulder, span }: PanelEdge) => ({
  center: { along: span - shoulder - corner, depth: depth - corner },
  radius: corner,
});

const panelEnd = (edge: PanelEdge): SilhouetteSegment[] => {
  const { corner, shoulder, span } = edge;
  const isDocked = shoulder > 0;
  const near: EdgeCircle = isDocked
    ? { center: { along: span, depth: shoulder }, radius: shoulder }
    : { center: { along: span - corner, depth: corner }, radius: corner };
  const footing = isDocked
    ? arcCurve(near, Math.PI, 3 * QUARTER)
    : arcCurve(near, 0, -QUARTER);
  const foot = footing[2];
  // a tucked lobe waits at the foot, so revealing it grows out of the panel instead of popping in
  return [
    curve(arcCurve(farEndCircle(edge), QUARTER, 0)),
    line({ along: span - shoulder, depth: isDocked ? shoulder : corner }),
    curve(footing),
    stay(foot),
    stay(foot),
    stay(foot),
  ];
};

// corner, neck, the lobe's two halves, the flare home: the same six segments as a tucked lobe
const gearLobe = (
  edge: PanelEdge,
  slot: number
): SilhouetteSegment[] | null => {
  const corner = farEndCircle(edge);
  const gear = {
    center: { along: edge.span + DOCK_GEAR_REACH, depth: edge.depth / 2 },
    radius: DOCK_GEAR_DIAMETER / 2,
  };
  const neck = filletBetween(corner, gear, GEAR_NECK);
  const flare = edgeFilletLandingAt(gear, edge.span + slot);
  if (!(neck && flare.radius > 0)) {
    return null;
  }
  const leaveCorner = angleBetween(corner.center, neck.center);
  const enterNeck = angleBetween(neck.center, corner.center);
  const leaveNeck = sweepTarget(
    enterNeck,
    angleBetween(neck.center, gear.center),
    "counterclockwise"
  );
  const enterGear = angleBetween(gear.center, neck.center);
  const leaveGear = sweepTarget(
    enterGear,
    angleBetween(gear.center, flare.center),
    "clockwise"
  );
  const crest = (enterGear + leaveGear) / 2;
  const enterFlare = angleBetween(flare.center, gear.center);
  return [
    curve(arcCurve(corner, QUARTER, leaveCorner)),
    line(pointOnCircle(corner, leaveCorner)),
    curve(arcCurve(neck, enterNeck, leaveNeck)),
    curve(arcCurve(gear, enterGear, crest)),
    curve(arcCurve(gear, crest, leaveGear)),
    curve(
      arcCurve(
        flare,
        enterFlare,
        sweepTarget(enterFlare, 3 * QUARTER, "counterclockwise")
      )
    ),
  ];
};

interface GearLobeOptions {
  revealed: boolean;
  /// Length past the panel kept for the lobe; 0 when the surface has no room for one.
  slot: number;
}

interface DockSilhouetteOptions extends SilhouetteBox {
  /// A lifted panel rounds its own corners — border-radius cannot reach a panel ending mid-frame.
  corner?: number;
  gear?: GearLobeOptions;
  shoulder: number;
}

/// Concave shoulders melting into the screen edge — the surface reads as attached, not stuck on.
export const dockSilhouettePath = ({
  corner = 0,
  gear,
  shoulder,
  ...box
}: DockSilhouetteOptions) => {
  const isSide = box.anchor === "left" || box.anchor === "right";
  const span = isSide ? box.height : box.width;
  const depth = isSide ? box.width : box.height;
  if (!(span > 0 && depth > 0)) {
    return "none";
  }
  const slot = gear && gear.slot < span ? gear.slot : 0;
  const panelSpan = span - slot;
  const fittedShoulder = Math.max(
    0,
    Math.min(shoulder, depth / 2, panelSpan / 4)
  );
  const edge: PanelEdge = {
    corner:
      fittedShoulder > 0
        ? fittedShoulder
        : Math.max(0, Math.min(corner, depth / 2, panelSpan / 2)),
    depth,
    shoulder: fittedShoulder,
    span: panelSpan,
  };
  const lobe =
    gear?.revealed && slot > 0 && edge.shoulder > 0
      ? gearLobe(edge, slot)
      : null;
  const segments = [
    ...panelStart(edge),
    line({ along: panelSpan - edge.shoulder - edge.corner, depth }),
    ...(lobe ?? panelEnd(edge)),
  ];
  const drawn = segments.map((segment) => drawSegment(box, segment));
  return `path("${[...drawn, "Z"].join(" ")}")`;
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
