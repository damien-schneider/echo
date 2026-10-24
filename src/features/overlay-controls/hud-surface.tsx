import { hasDockGearSlot } from "@/features/overlay-controls/overlay-presentation";
import { ResidentIsland } from "@/features/overlay-controls/resident-island";
import type { OverlaySurface } from "@/features/overlay-controls/runtime/overlay-surface";
import type { RecordingOverlayController } from "@/features/overlay-controls/use-recording-overlay-controller";

interface HudSurfaceProps {
  controller: RecordingOverlayController;
  surface: OverlaySurface;
}

export const HudSurface = ({ controller, surface }: HudSurfaceProps) => {
  const { actions, drag, hover, presentation } = controller;
  return (
    <ResidentIsland
      actionState={presentation.actionState}
      drag={drag}
      hasGearSlot={hasDockGearSlot(surface, controller.renderMode)}
      hover={hover}
      isExpanded={controller.renderMode === "actions"}
      isSideDocked={controller.isSideDocked}
      motionPhase={actions.motionPhase}
      onChat={actions.openChat}
      onOpenSettings={actions.openSettings}
      onPolish={actions.polish}
      onRecord={actions.toggleRecording}
      onReveal={actions.showControls}
      presentation={surface.presentation}
      residentRef={controller.residentRef}
      revealsGear={controller.revealsGear}
      triggerBox={surface.island}
    />
  );
};
