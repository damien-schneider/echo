import type { OverlayMode } from "@/features/overlay-controls/recording-overlay-state";

export type NativeOverlayTransitionPhase = "idle" | "morphing" | "preparing";

/// Each window carries its own mode alphabet, so the staged mode never widens
/// to the other window's surfaces.
export interface StagedNativeOverlayTransition<Mode extends OverlayMode> {
  generation: number;
  mode: Mode;
}

export interface NativeOverlayTransitionState<Mode extends OverlayMode> {
  error: string | null;
  phase: NativeOverlayTransitionPhase;
  staged: StagedNativeOverlayTransition<Mode>;
}

export type NativeOverlayTransitionEvent<Mode extends OverlayMode> =
  | { type: "error_dismissed" }
  | { generation: number; type: "prepare_started" }
  | {
      error: string | null;
      generation: number;
      mode: Mode;
      type: "prepare_finished";
    }
  | { error: string | null; generation: number; type: "settle_finished" };

/// Each window starts staged on the mode it opens with: the HUD on its handle,
/// the notification on the first surface it is asked for.
export const initialNativeOverlayTransition = <Mode extends OverlayMode>(
  mode: Mode
): NativeOverlayTransitionState<Mode> => ({
  error: null,
  phase: "idle",
  staged: { generation: 0, mode },
});

export const nativeOverlayFailureMessage =
  "Echo could not reposition its overlay window";

const isStale = <Mode extends OverlayMode>(
  state: NativeOverlayTransitionState<Mode>,
  generation: number
) => generation < state.staged.generation;

// A failed native preflight still stages the render: a stuck window is
// recoverable, an island frozen in the previous mode is not.
export const reduceNativeOverlayTransition = <Mode extends OverlayMode>(
  state: NativeOverlayTransitionState<Mode>,
  event: NativeOverlayTransitionEvent<Mode>
): NativeOverlayTransitionState<Mode> => {
  if (event.type === "error_dismissed") {
    return state.error === null ? state : { ...state, error: null };
  }
  if (event.type === "prepare_started") {
    return isStale(state, event.generation)
      ? state
      : { ...state, phase: "preparing" };
  }
  if (isStale(state, event.generation)) {
    return state;
  }
  if (event.type === "prepare_finished") {
    return {
      error: event.error,
      phase: "morphing",
      staged: { generation: event.generation, mode: event.mode },
    };
  }
  return {
    ...state,
    error: event.error ?? state.error,
    phase: "idle",
  };
};

export const nativeOverlayModeToSettle = <Mode extends OverlayMode>(
  state: NativeOverlayTransitionState<Mode>,
  completedGeneration: number
): Mode | null =>
  state.staged.generation === completedGeneration && state.phase === "morphing"
    ? state.staged.mode
    : null;
