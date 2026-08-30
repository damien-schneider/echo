import "@/overlay/recording-overlay.css";
import { HudSurface } from "@/features/overlay-controls/hud-surface";
import { IslandMorph } from "@/features/overlay-controls/motion/island-morph";
import {
  SCREEN_HANDOFF_STYLE,
  screenHandoffFreezesLayout,
} from "@/features/overlay-controls/runtime/screen-handoff";
import { useNativeHover } from "@/features/overlay-controls/runtime/use-native-hover";
import { useOverlayMenu } from "@/features/overlay-controls/runtime/use-overlay-menu";
import { useRecordingOverlayController } from "@/features/overlay-controls/use-recording-overlay-controller";

const RecordingOverlay = () => {
  const controller = useRecordingOverlayController();
  useNativeHover();
  useOverlayMenu();
  const surface = controller.events.surface;
  if (!(controller.events.isSurfaceReady && surface)) {
    return null;
  }

  return (
    <div
      className="recording-overlay-root"
      data-anchor={surface.anchor}
      data-dragging={controller.drag.isDragging}
      data-handoff={controller.handoff}
      data-presentation={surface.presentation}
      data-state={controller.renderMode}
      data-transition-error={controller.transitionError ?? undefined}
      style={SCREEN_HANDOFF_STYLE}
    >
      <IslandMorph
        contentKey={controller.renderMode}
        freezesLayout={screenHandoffFreezesLayout(controller.handoff)}
        isDragging={controller.drag.isDragging}
        mode={controller.renderMode}
        onMorphComplete={controller.finishMorph}
        surface={surface}
      >
        <HudSurface controller={controller} surface={surface} />
      </IslandMorph>
    </div>
  );
};

export default RecordingOverlay;
