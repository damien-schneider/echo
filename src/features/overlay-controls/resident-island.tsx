import { GripHorizontal } from "lucide-react";
import {
  type CSSProperties,
  type MouseEvent,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { IslandActions } from "@/features/overlay-controls/island-actions";
import type { IslandActionState } from "@/features/overlay-controls/recording-overlay-state";
import type { IslandControlMotionPhase } from "@/features/overlay-controls/runtime/island-control-state";
import type {
  OverlayAnchor,
  OverlayBox,
  OverlayPresentation,
} from "@/features/overlay-controls/runtime/overlay-surface";
import type { EdgeDockDrag } from "@/features/overlay-controls/runtime/use-edge-dock-drag";
import type { useResidentHover } from "@/features/overlay-controls/runtime/use-resident-hover";

interface ActionPorts {
  actionState: IslandActionState;
  onChat: () => void;
  onPolish: () => void;
  onRecord: () => void;
}

interface ResidentIslandProps extends ActionPorts {
  anchor: OverlayAnchor;
  drag: EdgeDockDrag;
  hover: ReturnType<typeof useResidentHover>;
  isExpanded: boolean;
  isSideDocked: boolean;
  motionPhase: IslandControlMotionPhase;
  onReveal: () => void;
  presentation: OverlayPresentation;
  residentRef: RefObject<HTMLDivElement | null>;
  triggerBox: OverlayBox;
}

const useResidentActionFocus = (isExpanded: boolean, onReveal: () => void) => {
  const actionsRef = useRef<HTMLDivElement>(null);
  const focusAfterReveal = useRef(false);
  useEffect(() => {
    if (!(isExpanded && focusAfterReveal.current)) {
      return;
    }
    actionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    focusAfterReveal.current = false;
  }, [isExpanded]);
  const revealForActivation = (event: MouseEvent<HTMLButtonElement>) => {
    focusAfterReveal.current = event.detail === 0;
    onReveal();
  };
  return { actionsRef, revealForActivation };
};

interface ResidentContentProps extends ActionPorts {
  actionsRef: RefObject<HTMLDivElement | null>;
  isInteractive: boolean;
  orientation: "horizontal" | "vertical";
}

const ResidentContent = ({
  actionsRef,
  isInteractive,
  orientation,
  ...actions
}: ResidentContentProps) => (
  <div
    aria-hidden={isInteractive ? undefined : true}
    className="echo-island-resident-actions"
    inert={isInteractive ? undefined : true}
    ref={actionsRef}
  >
    <IslandActions
      {...actions}
      isVisible={isInteractive}
      orientation={orientation}
    />
  </div>
);

interface ResidentTriggerProps {
  box: OverlayBox;
  motionPhase: IslandControlMotionPhase;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter: () => void;
}

// Portalled out of the clipped island so the hit area can survive the collapse.
const ResidentTrigger = ({
  box,
  motionPhase,
  onActivate,
  onPointerEnter,
}: ResidentTriggerProps) => {
  const frame: CSSProperties = {
    height: box.height,
    left: box.x,
    top: box.y,
    width: box.width,
  };
  return createPortal(
    <Button
      aria-label="Open Echo actions"
      className="echo-island-handle-hitbox"
      data-motion={motionPhase}
      onClick={onActivate}
      onPointerEnter={onPointerEnter}
      style={frame}
      title="Open Echo actions"
      type="button"
      variant="ghost"
    />,
    document.body
  );
};

export const ResidentIsland = ({
  anchor,
  drag,
  hover,
  presentation,
  isExpanded,
  isSideDocked,
  motionPhase,
  onReveal,
  residentRef,
  triggerBox,
  ...actions
}: ResidentIslandProps) => {
  const showsActions = isSideDocked || isExpanded;
  const actionsAreInteractive =
    !drag.isDragging &&
    (isSideDocked || (isExpanded && motionPhase === "open"));
  // The grip must survive its own drag: nothing may unmount under the pointer.
  const showsDockGrip =
    drag.isDragging ||
    isSideDocked ||
    (isExpanded && motionPhase === "open" && presentation === "docked");
  const { actionsRef, revealForActivation } = useResidentActionFocus(
    isExpanded,
    onReveal
  );
  const orientation = isSideDocked ? "vertical" : "horizontal";
  return (
    <>
      {showsActions ? null : (
        <ResidentTrigger
          box={triggerBox}
          motionPhase={motionPhase}
          onActivate={revealForActivation}
          onPointerEnter={hover.onTriggerPointerEnter}
        />
      )}
      <div
        className="echo-island-resident"
        data-active={hover.isActive}
        data-anchor={anchor}
        data-expanded={showsActions}
        data-motion={motionPhase}
        data-orientation={orientation}
        onBlurCapture={hover.onBlurCapture}
        onFocusCapture={hover.onFocusCapture}
        onPointerDownCapture={hover.onPointerDownCapture}
        onPointerEnter={hover.onPointerEnter}
        onPointerLeave={hover.onPointerLeave}
        ref={residentRef}
      >
        <span aria-hidden="true" className="echo-island-resident-shell" />
        {showsDockGrip ? (
          <button
            aria-label="Move Echo control"
            className="echo-island-dock-grip"
            onKeyDown={drag.onGripKeyDown}
            onPointerDown={drag.onGripPointerDown}
            title="Move Echo control"
            type="button"
          >
            <GripHorizontal
              aria-hidden="true"
              className="echo-island-dock-grip-icon"
            />
          </button>
        ) : null}
        <ResidentContent
          {...actions}
          actionsRef={actionsRef}
          isInteractive={actionsAreInteractive}
          orientation={orientation}
        />
      </div>
    </>
  );
};
