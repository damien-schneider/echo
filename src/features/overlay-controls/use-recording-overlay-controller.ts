import { type RefObject, useEffect, useRef } from "react";
import { useNativeOverlayTransition } from "@/features/overlay-controls/motion/use-native-overlay-transition";
import {
  createHudPresentation,
  isSideDockedSurface,
} from "@/features/overlay-controls/overlay-presentation";
import type { OverlayMode } from "@/features/overlay-controls/recording-overlay-state";
import { HUD_WINDOW } from "@/features/overlay-controls/runtime/overlay-windows";
import { useEdgeDockDrag } from "@/features/overlay-controls/runtime/use-edge-dock-drag";
import { useResidentHover } from "@/features/overlay-controls/runtime/use-resident-hover";
import { useScreenHandoff } from "@/features/overlay-controls/runtime/use-screen-handoff";
import { useHudEvents } from "@/features/overlay-controls/use-hud-events";
import { useIslandControls } from "@/features/overlay-controls/use-island-controls";
import { usePolishModel } from "@/features/polish/use-polish-model";

/// Attention moves to the notification, so the HUD folds back into its handle.
const useCollapseOnActiveOperation = (
  hasActiveOperation: boolean,
  collapse: () => void
) => {
  const wasActive = useRef(false);
  useEffect(() => {
    if (hasActiveOperation && !wasActive.current) {
      collapse();
    }
    wasActive.current = hasActiveOperation;
  }, [collapse, hasActiveOperation]);
};

const ignorePersistentHover = () => undefined;

interface DockHoverOptions {
  isDragging: boolean;
  isSideDocked: boolean;
  onCollapse: () => void;
  onReveal: () => void;
  renderMode: OverlayMode;
  residentRef: RefObject<HTMLDivElement | null>;
}

const useDockHover = ({
  isDragging,
  isSideDocked,
  onCollapse,
  onReveal,
  renderMode,
  residentRef,
}: DockHoverOptions) => {
  // collapsing mid-drag would resize the window the compositor is already moving
  const holdsIslandOpen = isSideDocked || isDragging;
  const hover = useResidentHover({
    isExpanded: renderMode === "actions" && !isSideDocked,
    onCollapse: holdsIslandOpen ? ignorePersistentHover : onCollapse,
    onReveal: holdsIslandOpen ? ignorePersistentHover : onReveal,
    residentRef,
  });
  // a side dock already shows its actions, so only hover can ask it for more
  const revealsGear =
    !isDragging && (isSideDocked ? hover.isActive : renderMode === "actions");
  return { hover, revealsGear };
};

const useHudPresentation = () => {
  const events = useHudEvents();
  const polish = usePolishModel();
  const actions = useIslandControls({
    isRecording: events.isVisible && events.state === "recording",
    polishStatus: polish.status,
  });
  const presentation = createHudPresentation({
    isControlsOpen: actions.isControlsOpen,
    isVisible: events.isVisible,
    state: events.state,
  });
  return { actions, events, presentation };
};

export const useRecordingOverlayController = () => {
  const residentRef = useRef<HTMLDivElement>(null);
  const { actions, events, presentation } = useHudPresentation();
  const transition = useNativeOverlayTransition({
    channel: HUD_WINDOW,
    initialMode: "compact",
    mode: presentation.mode,
  });
  const renderMode = transition.staged.mode;
  const drag = useEdgeDockDrag();
  const handoff = useScreenHandoff();
  const isSideDocked = isSideDockedSurface(events.surface);
  const { hover, revealsGear } = useDockHover({
    isDragging: drag.isDragging,
    isSideDocked,
    onCollapse: actions.collapseControls,
    onReveal: actions.showControls,
    renderMode,
    residentRef,
  });

  useCollapseOnActiveOperation(
    presentation.hasActiveOperation,
    actions.dismissControls
  );

  return {
    actions,
    drag,
    events,
    finishMorph: () => {
      actions.finishCollapse();
      transition.settle(transition.staged.generation);
    },
    handoff,
    hover,
    isSideDocked,
    presentation,
    renderMode,
    residentRef,
    revealsGear,
    transitionError: transition.error,
  };
};

export type RecordingOverlayController = ReturnType<
  typeof useRecordingOverlayController
>;
