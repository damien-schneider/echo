import {
  type HudMode,
  hudModeFor,
  type IslandActionState,
  isActiveOverlayState,
  islandActionStateFor,
  type OverlayMode,
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

/// Docked toolbars keep room past the panel for the settings lobe; a floating bar has nowhere to hang one.
export const hasDockGearSlot = (
  surface: Pick<OverlaySurface, "anchor" | "presentation">,
  mode: OverlayMode
) =>
  surface.presentation === "docked" &&
  (isSideDockedSurface(surface) || mode === "actions");
