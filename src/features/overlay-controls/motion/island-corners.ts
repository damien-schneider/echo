import type {
  OverlayAnchor,
  OverlayPresentation,
} from "@/features/overlay-controls/runtime/overlay-surface";

export const PILL_RADIUS = 999;
/// The side dock's silhouette draws its outline; the box only has to stay inside it.
const SURFACE_RADIUS = 10;

export interface IslandCornerRadii {
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
}

/// Radii are the corners the content root declares, already concentric with what it holds.
export type IslandShape = "pill" | "surface" | IslandCornerRadii;

interface IslandCornerOptions {
  anchor: OverlayAnchor;
  /// Band hanging below the cut-out — null when the island does not bridge the notch.
  bridgeBand: number | null;
  isDragging?: boolean;
  presentation: OverlayPresentation;
  shape: IslandShape;
}

const uniformRadii = (radius: number): IslandCornerRadii => ({
  borderBottomLeftRadius: radius,
  borderBottomRightRadius: radius,
  borderTopLeftRadius: radius,
  borderTopRightRadius: radius,
});

const shapeRadii = (shape: IslandShape) => {
  if (shape === "pill") {
    return uniformRadii(PILL_RADIUS);
  }
  return shape === "surface" ? uniformRadii(SURFACE_RADIUS) : shape;
};

// a side dock squares the corners touching its edge so it reads as attached; top and bottom docks float
export const islandCornerRadii = ({
  anchor,
  bridgeBand,
  isDragging,
  presentation,
  shape,
}: IslandCornerOptions): IslandCornerRadii => {
  const radii = shapeRadii(shape);
  if (isDragging) {
    return radii;
  }
  if (bridgeBand !== null) {
    const pillEnd = bridgeBand / 2;
    return {
      borderBottomLeftRadius:
        shape === "pill" ? pillEnd : radii.borderBottomLeftRadius,
      borderBottomRightRadius:
        shape === "pill" ? pillEnd : radii.borderBottomRightRadius,
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
  return radii;
};
