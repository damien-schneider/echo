import type { Transition } from "motion/react";
import { useEffect, useState } from "react";
import type {
  OverlayBox,
  OverlaySurface,
} from "@/features/overlay-controls/runtime/overlay-surface";

// stiff and barely under critical damping — the island lands once instead of ringing
const ISLAND_LAYOUT_SPRING = {
  damping: 36,
  mass: 0.55,
  stiffness: 700,
  type: "spring",
} as const;

const INSTANT = { duration: 0 } as const;

const LAYOUT_TRANSITION = {
  borderBottomLeftRadius: ISLAND_LAYOUT_SPRING,
  borderBottomRightRadius: ISLAND_LAYOUT_SPRING,
  borderTopLeftRadius: ISLAND_LAYOUT_SPRING,
  borderTopRightRadius: ISLAND_LAYOUT_SPRING,
  clipPath: ISLAND_LAYOUT_SPRING,
  height: ISLAND_LAYOUT_SPRING,
  scale: ISLAND_LAYOUT_SPRING,
  width: ISLAND_LAYOUT_SPRING,
  x: ISLAND_LAYOUT_SPRING,
  y: ISLAND_LAYOUT_SPRING,
} as const;

// the window carried the island here — springing the frame would replay a trip it never made
const DROP_LANDING = {
  ...LAYOUT_TRANSITION,
  height: INSTANT,
  width: INSTANT,
  x: INSTANT,
  y: INSTANT,
} as const;

// mirrored outlines interpolate through a sliver, so a new edge swaps the silhouette outright
const EDGE_LANDING = {
  ...DROP_LANDING,
  borderBottomLeftRadius: INSTANT,
  borderBottomRightRadius: INSTANT,
  borderTopLeftRadius: INSTANT,
  borderTopRightRadius: INSTANT,
  clipPath: INSTANT,
} as const;

type Landing = "drop" | "edge" | "none";

const LANDING_TRANSITION: Record<Landing, Transition> = {
  drop: DROP_LANDING,
  edge: EDGE_LANDING,
  none: LAYOUT_TRANSITION,
};

interface CanvasPoint {
  x: number;
  y: number;
}

interface Placement {
  isDragging: boolean;
  surface: OverlaySurface;
}

interface LandingState {
  base: CanvasPoint;
  landing: Landing;
  seen: Placement;
}

// mode changes move the window too, but only a drag or a new edge actually relocates the island
const landingBetween = (previous: Placement, next: Placement): Landing => {
  if (previous.surface.anchor !== next.surface.anchor) {
    return "edge";
  }
  const from = previous.surface.window;
  const to = next.surface.window;
  const windowMoved = from.x !== to.x || from.y !== to.y;
  return previous.isDragging && windowMoved ? "drop" : "none";
};

// a landing shifts the canvas with the window, so neither the origin nor the island moves at commit
const nextLanding = (state: LandingState, next: Placement): LandingState => {
  const landing = landingBetween(state.seen, next);
  if (landing === "none") {
    return { ...state, landing, seen: next };
  }
  const from = state.seen.surface.window;
  const to = next.surface.window;
  return {
    base: {
      x: state.base.x + to.x - from.x,
      y: state.base.y + to.y - from.y,
    },
    landing,
    seen: next,
  };
};

interface IslandLandingOptions extends Placement {
  freezesLayout: boolean;
  reduceMotion: boolean;
}

export interface IslandLanding {
  /// What the canvas cancels — the window origin, less every relocation already absorbed.
  canvasOrigin: CanvasPoint;
  toCanvas: (box: OverlayBox) => OverlayBox;
  transition: Transition;
}

export const useIslandLanding = ({
  freezesLayout,
  reduceMotion,
  ...placement
}: IslandLandingOptions): IslandLanding => {
  const [state, setState] = useState<LandingState>({
    base: { x: 0, y: 0 },
    landing: "none",
    seen: placement,
  });
  const changed =
    state.seen.surface !== placement.surface ||
    state.seen.isDragging !== placement.isDragging;
  const current = changed ? nextLanding(state, placement) : state;
  if (changed) {
    setState(current);
  }
  const { base, landing } = current;
  // one commit only — later resizes on the same surface spring as usual
  useEffect(() => {
    if (landing !== "none") {
      setState((latest) => ({ ...latest, landing: "none" }));
    }
  }, [landing]);
  return {
    canvasOrigin: {
      x: placement.surface.window.x - base.x,
      y: placement.surface.window.y - base.y,
    },
    toCanvas: (box) => ({ ...box, x: box.x - base.x, y: box.y - base.y }),
    transition:
      reduceMotion || freezesLayout ? INSTANT : LANDING_TRANSITION[landing],
  };
};
