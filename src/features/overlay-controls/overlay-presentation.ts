import {
  type HudMode,
  hudModeFor,
  type IslandActionState,
  isActiveOverlayState,
  islandActionStateFor,
  type OverlayState,
} from "@/features/overlay-controls/recording-overlay-state";
import type { OverlaySurface } from "@/features/overlay-controls/runtime/overlay-surface";

export interface HudPresentation {
  actionState: IslandActionState;
  hasActiveOperation: boolean;
  mode: HudMode;
}

interface HudPresentationOptions {
  isControlsOpen: boolean;
  isVisible: boolean;
  state: OverlayState;
}

/// The HUD reads activity only to light its record button; the words belong to the notification.
export const createHudPresentation = ({
  isControlsOpen,
  isVisible,
  state,
}: HudPresentationOptions): HudPresentation => {
  const hasActiveOperation = isVisible && isActiveOverlayState(state);
  return {
    actionState: islandActionStateFor({
      hasActiveOperation,
      isRecording: hasActiveOperation && state === "recording",
    }),
    hasActiveOperation,
    mode: hudModeFor(isControlsOpen),
  };
};

export const isSideDockedSurface = (
  surface: Pick<OverlaySurface, "anchor" | "presentation"> | null
) =>
  surface !== null &&
  surface.presentation === "docked" &&
  (surface.anchor === "left" || surface.anchor === "right");
