import type {
  OverlayAnchor,
  OverlayPresentation,
} from "@/features/overlay-controls/runtime/overlay-surface";

const PILL_RADIUS = 999;
const SURFACE_RADIUS = 10;

export interface IslandCornerRadii {
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
}

interface IslandCornerOptions {
  anchor: OverlayAnchor;
  bridgesNotch: boolean;
  isCompactHandle: boolean;
  isDragging?: boolean;
  presentation: OverlayPresentation;
}

// corners touching a screen edge stay square so the surface reads as attached, not floating
export const islandCornerRadii = ({
  anchor,
  bridgesNotch,
  isCompactHandle,
  isDragging,
  presentation,
}: IslandCornerOptions): IslandCornerRadii => {
  const radius = isCompactHandle ? PILL_RADIUS : SURFACE_RADIUS;
  const radii = {
    borderBottomLeftRadius: radius,
    borderBottomRightRadius: radius,
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
  };
  if (isDragging) {
    return radii;
  }
  if (bridgesNotch) {
    return { ...radii, borderTopLeftRadius: 0, borderTopRightRadius: 0 };
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
