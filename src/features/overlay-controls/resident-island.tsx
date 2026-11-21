import { Button } from "@ctrl-ui/react/ui/button";
import { DotsSixIcon, GearSixIcon } from "@phosphor-icons/react";
import type { MotionValue } from "motion/react";
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
  OverlayPresentation,
  OverlaySurface,
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
  voice: MotionValue<number>;
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

type TriggerSurface = Pick<OverlaySurface, "anchor" | "island">;

interface ResidentTriggerProps {
  motionPhase: IslandControlMotionPhase;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter: () => void;
  surface: TriggerSurface;
}

// the pointer pushed into the screen edge still lands on a handle floating just off it — mirrors surface_hover_box
const edgeReachingFrame = ({
  anchor,
  island,
}: TriggerSurface): CSSProperties => {
  if (anchor === "bottom") {
    return { bottom: 0, left: island.x, top: island.y, width: island.width };
  }
  if (anchor === "left") {
    return {
      height: island.height,
      left: 0,
      top: island.y,
      width: island.x + island.width,
    };
  }
  if (anchor === "right") {
    return { height: island.height, left: island.x, right: 0, top: island.y };
  }
  return {
    height: island.y + island.height,
    left: island.x,
    top: 0,
    width: island.width,
  };
};

const ResidentTrigger = ({
  motionPhase,
  onActivate,
  onPointerEnter,
  surface,
}: ResidentTriggerProps) =>
  createPortal(
    <Button
      aria-label="Open Echo actions"
      className="echo-island-handle-hitbox"
      data-motion={motionPhase}
      onClick={onActivate}
      onPointerEnter={onPointerEnter}
      style={edgeReachingFrame(surface)}
      title="Open Echo actions"
      type="button"
      variant="ghost"
    />,
    document.body
  );

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
  isHovered: boolean;
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
  /// Docked toolbars only — the bar has no slot beside it for the gear.
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
        isHovered={hover.isActive}
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
  trigger: TriggerSurface;
}

export const ResidentIsland = ({
  isExpanded,
  isSideDocked,
  motionPhase,
  onReveal,
  trigger,
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
          motionPhase={motionPhase}
          onActivate={revealForActivation}
          onPointerEnter={dock.hover.onTriggerPointerEnter}
          surface={trigger}
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
