import type { TargetAndTransition } from "motion/react";
import {
  DOCK_SHOULDER,
  dockSilhouettePath,
} from "@/features/overlay-controls/motion/dock-silhouette";
import type { OverlaySurface } from "@/features/overlay-controls/runtime/overlay-surface";

// no hardware notch — a short seam at the top edge reads the same once it grows
const SEAM_WIDTH = 104;
const SEAM_HEIGHT = 6;
const SEAM_RADIUS = 12;

export type IslandEntry = TargetAndTransition;

/// Growing out of the notch box is what makes it read as hardware, not a panel flying in.
export const notchEntry = (surface: OverlaySurface): IslandEntry => {
  const { island, notch, window: origin } = surface;
  const box = notch
    ? {
        height: notch.height,
        width: notch.width,
        x: notch.x + origin.x,
        y: origin.y,
      }
    : {
        height: SEAM_HEIGHT,
        width: SEAM_WIDTH,
        x: origin.x + island.x + (island.width - SEAM_WIDTH) / 2,
        y: origin.y,
      };
  const radius = Math.min(SEAM_RADIUS, box.height / 2, box.width / 2);
  return {
    ...box,
    borderBottomLeftRadius: radius,
    borderBottomRightRadius: radius,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    // the silhouette travels with the box, so the shoulders fold into the seam instead of freezing
    clipPath: dockSilhouettePath({
      anchor: "top",
      height: box.height,
      shoulder: DOCK_SHOULDER,
      width: box.width,
    }),
  };
};
