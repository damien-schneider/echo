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
      anchor={surface.anchor}
      drag={drag}
      hover={hover}
      isExpanded={controller.renderMode === "actions"}
      isSideDocked={controller.isSideDocked}
      motionPhase={actions.motionPhase}
      onChat={actions.openChat}
      onPolish={actions.polish}
      onRecord={actions.toggleRecording}
      onReveal={actions.showControls}
      presentation={surface.presentation}
      residentRef={controller.residentRef}
      triggerBox={surface.island}
    />
  );
};
