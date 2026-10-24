import { Button } from "@ctrl-ui/react/ui/button";
import { DotsSixIcon, GearSixIcon } from "@phosphor-icons/react";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { IslandActions } from "@/features/overlay-controls/island-actions";
import {
  DOCK_GEAR_DIAMETER,
  DOCK_GEAR_REACH,
  DOCK_GEAR_SLOT,
} from "@/features/overlay-controls/motion/dock-silhouette";
import type { IslandActionState } from "@/features/overlay-controls/recording-overlay-state";
import type { IslandControlMotionPhase } from "@/features/overlay-controls/runtime/island-control-state";
import type {
  OverlayBox,
  OverlayPresentation,
} from "@/features/overlay-controls/runtime/overlay-surface";
import type { EdgeDockDrag } from "@/features/overlay-controls/runtime/use-edge-dock-drag";
import type { ResidentHover } from "@/features/overlay-controls/runtime/use-resident-hover";
import "@/features/overlay-controls/resident-island.css";

type ResidentOrientation = "horizontal" | "vertical";

interface ActionPorts {
  actionState: IslandActionState;
  onChat: () => void;
  onPolish: () => void;
  onRecord: () => void;
}

interface DockGearStyle extends CSSProperties {
  "--echo-dock-gear-reach": string;
  "--echo-dock-gear-size": string;
  "--echo-dock-gear-slot": string;
}

// the silhouette owns the lobe geometry; the button only sits where it grows
const DOCK_GEAR_STYLE: DockGearStyle = {
  "--echo-dock-gear-reach": `${DOCK_GEAR_REACH}px`,
  "--echo-dock-gear-size": `${DOCK_GEAR_DIAMETER}px`,
  "--echo-dock-gear-slot": `${DOCK_GEAR_SLOT}px`,
};

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

interface ResidentTriggerProps {
  box: OverlayBox;
  motionPhase: IslandControlMotionPhase;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter: () => void;
}

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

interface DockGripProps {
  drag: EdgeDockDrag;
  isLive: boolean;
}

const DockGrip = ({ drag, isLive }: DockGripProps) => (
  <button
    aria-label="Move Echo control"
    className="echo-island-dock-grip"
    data-live={isLive}
    inert={isLive ? undefined : true}
    onKeyDown={drag.onGripKeyDown}
    onPointerDown={drag.onGripPointerDown}
    title="Move Echo control"
    type="button"
  >
    <DotsSixIcon aria-hidden="true" className="echo-island-dock-grip-icon" />
  </button>
);

interface DockGearProps {
  isRevealed: boolean;
  onOpenSettings: () => void;
}

const DockGear = ({ isRevealed, onOpenSettings }: DockGearProps) => (
  <Button
    aria-label="Open Echo settings"
    className="echo-island-gear"
    data-revealed={isRevealed}
    iconOnly
    inert={isRevealed ? undefined : true}
    onClick={onOpenSettings}
    size="xs"
    title="Open Echo settings"
    variant="ghost"
  >
    <GearSixIcon aria-hidden="true" />
  </Button>
);

interface ResidentPanelProps extends ActionPorts {
  actionsRef: RefObject<HTMLDivElement | null>;
  drag: EdgeDockDrag;
  hasGrip: boolean;
  isInteractive: boolean;
  isVisible: boolean;
  orientation: ResidentOrientation;
}

const ResidentPanel = ({
  actionsRef,
  drag,
  hasGrip,
  isInteractive,
  isVisible,
  orientation,
  ...actions
}: ResidentPanelProps) => (
  <div className="echo-island-resident-panel">
    {hasGrip ? (
      <DockGrip drag={drag} isLive={drag.isDragging || isVisible} />
    ) : null}
    <div
      aria-hidden={isInteractive ? undefined : true}
      className="echo-island-resident-actions"
      inert={isInteractive ? undefined : true}
      ref={actionsRef}
    >
      <IslandActions
        {...actions}
        isVisible={isVisible}
        orientation={orientation}
      />
    </div>
  </div>
);

interface ResidentFrameProps {
  children: ReactNode;
  hover: ResidentHover;
  orientation: ResidentOrientation;
  presentation: OverlayPresentation;
  residentRef: RefObject<HTMLDivElement | null>;
  showsActions: boolean;
}

const ResidentFrame = ({
  children,
  hover,
  orientation,
  presentation,
  residentRef,
  showsActions,
}: ResidentFrameProps) => (
  <div
    className="echo-island-resident"
    data-active={hover.isActive}
    data-expanded={showsActions}
    data-orientation={orientation}
    data-presentation={presentation}
    onBlurCapture={hover.onBlurCapture}
    onFocusCapture={hover.onFocusCapture}
    onPointerDownCapture={hover.onPointerDownCapture}
    onPointerEnter={hover.onPointerEnter}
    onPointerLeave={hover.onPointerLeave}
    ref={residentRef}
    style={DOCK_GEAR_STYLE}
  >
    <span aria-hidden="true" className="echo-island-resident-shell" />
    {children}
  </div>
);

interface ResidentDockProps extends ActionPorts {
  actionsRef: RefObject<HTMLDivElement | null>;
  drag: EdgeDockDrag;
  /// Docked toolbars only — a floating bar has no edge to hang the lobe from.
  hasGearSlot: boolean;
  hover: ResidentHover;
  isVisible: boolean;
  onOpenSettings: () => void;
  orientation: ResidentOrientation;
  presentation: OverlayPresentation;
  residentRef: RefObject<HTMLDivElement | null>;
  revealsGear: boolean;
  showsActions: boolean;
}

const ResidentDock = ({
  actionsRef,
  drag,
  hasGearSlot,
  hover,
  isVisible,
  onOpenSettings,
  orientation,
  presentation,
  residentRef,
  revealsGear,
  showsActions,
  ...actions
}: ResidentDockProps) => {
  // the lifted island keeps its face; it just stops taking clicks
  const isInteractive = isVisible && !drag.isDragging;
  return (
    <ResidentFrame
      hover={hover}
      orientation={orientation}
      presentation={presentation}
      residentRef={residentRef}
      showsActions={showsActions}
    >
      <ResidentPanel
        {...actions}
        actionsRef={actionsRef}
        drag={drag}
        hasGrip={presentation === "docked"}
        isInteractive={isInteractive}
        isVisible={isVisible}
        orientation={orientation}
      />
      {hasGearSlot ? (
        <DockGear
          isRevealed={revealsGear && isInteractive}
          onOpenSettings={onOpenSettings}
        />
      ) : null}
    </ResidentFrame>
  );
};

interface ResidentIslandProps
  extends Omit<
    ResidentDockProps,
    "actionsRef" | "isVisible" | "orientation" | "showsActions"
  > {
  isExpanded: boolean;
  isSideDocked: boolean;
  motionPhase: IslandControlMotionPhase;
  onReveal: () => void;
  triggerBox: OverlayBox;
}

export const ResidentIsland = ({
  isExpanded,
  isSideDocked,
  motionPhase,
  onReveal,
  triggerBox,
  ...dock
}: ResidentIslandProps) => {
  const showsActions = isSideDocked || isExpanded;
  const { actionsRef, revealForActivation } = useResidentActionFocus(
    isExpanded,
    onReveal
  );
  return (
    <>
      {showsActions ? null : (
        <ResidentTrigger
          box={triggerBox}
          motionPhase={motionPhase}
          onActivate={revealForActivation}
          onPointerEnter={dock.hover.onTriggerPointerEnter}
        />
      )}
      <ResidentDock
        {...dock}
        actionsRef={actionsRef}
        isVisible={isSideDocked || (isExpanded && motionPhase === "open")}
        orientation={isSideDocked ? "vertical" : "horizontal"}
        showsActions={showsActions}
      />
    </>
  );
};
