import type { TargetAndTransition } from "motion/react";
import type { OverlaySurface } from "@/features/overlay-controls/runtime/overlay-surface";

// Without a hardware notch the surface still has to come from somewhere: a
// short seam at the very top edge reads the same way once it grows.
const SEAM_WIDTH = 104;
const SEAM_HEIGHT = 6;
const SEAM_RADIUS = 12;

export type IslandEntry = TargetAndTransition;

/// Where a notification is born and where it goes back to: the notch itself.
/// Growing out of that box is what makes it read as part of the hardware
/// instead of a panel flying in from another corner of the screen.
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
  };
};
