/// Only whether the action row is out — chat and the model panel are notification state.
export interface IslandControlState {
  isControlsOpen: boolean;
}

export type IslandControlMotionPhase = "compact" | "open" | "closing";

export type IslandControlMotionState = IslandControlState & {
  motionPhase: IslandControlMotionPhase;
};

export const initialIslandControlState: IslandControlState = {
  isControlsOpen: false,
};

export const initialIslandControlMotionState: IslandControlMotionState = {
  ...initialIslandControlState,
  motionPhase: "compact",
};

export const revealIslandControls = (): IslandControlMotionState => ({
  isControlsOpen: true,
  motionPhase: "open",
});

export const beginIslandCollapse = (
  state: IslandControlMotionState
): IslandControlMotionState => {
  if (!state.isControlsOpen) {
    return state;
  }
  return { ...state, isControlsOpen: false, motionPhase: "closing" };
};

export const finishIslandCollapse = (
  state: IslandControlMotionState
): IslandControlMotionState => {
  if (state.motionPhase !== "closing") {
    return state;
  }
  return initialIslandControlMotionState;
};
