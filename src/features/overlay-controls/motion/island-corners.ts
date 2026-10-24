import type {
  OverlayAnchor,
  OverlayPresentation,
} from "@/features/overlay-controls/runtime/overlay-surface";

export const PILL_RADIUS = 999;
const SURFACE_RADIUS = 10;
// Dynamic-Island proportion: the curve is half the band under the cut-out, capped for tall panels
const BRIDGE_RADIUS_MAX = 28;

export interface IslandCornerRadii {
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
}

interface IslandCornerOptions {
  anchor: OverlayAnchor;
  /// Island height left under the notch strip — null when the island does not bridge it.
  bridgeBand: number | null;
  isDragging?: boolean;
  /// pill → round buttons sit concentric in the ends
  isPill: boolean;
  presentation: OverlayPresentation;
}

const bridgedBottomRadius = (band: number) =>
  Math.min(Math.max(band / 2, SURFACE_RADIUS), BRIDGE_RADIUS_MAX);

// corners touching a screen edge stay square so the surface reads as attached, not floating
export const islandCornerRadii = ({
  anchor,
  bridgeBand,
  isPill,
  isDragging,
  presentation,
}: IslandCornerOptions): IslandCornerRadii => {
  const radius = isPill ? PILL_RADIUS : SURFACE_RADIUS;
  const radii = {
    borderBottomLeftRadius: radius,
    borderBottomRightRadius: radius,
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
  };
  if (isDragging) {
    return radii;
  }
  if (bridgeBand !== null) {
    const bottom = bridgedBottomRadius(bridgeBand);
    return {
      borderBottomLeftRadius: bottom,
      borderBottomRightRadius: bottom,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    };
  }
  if (presentation !== "docked") {
    return radii;
  }
  if (anchor === "left") {
    return {
      ...radii,
      borderBottomLeftRadius: 0,
      borderTopLeftRadius: 0,
    };
  }
  if (anchor === "right") {
    return {
      ...radii,
      borderBottomRightRadius: 0,
      borderTopRightRadius: 0,
    };
  }
  if (anchor === "top") {
    return { ...radii, borderTopLeftRadius: 0, borderTopRightRadius: 0 };
  }
  return { ...radii, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 };
};
