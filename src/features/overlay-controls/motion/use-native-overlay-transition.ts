import { invoke } from "@tauri-apps/api/core";
import { useEffect, useEffectEvent, useReducer, useRef } from "react";
import {
  initialNativeOverlayTransition,
  nativeOverlayFailureMessage,
  nativeOverlayModeToSettle,
  reduceNativeOverlayTransition,
} from "@/features/overlay-controls/motion/native-window-transition";
import type { OverlayMode } from "@/features/overlay-controls/recording-overlay-state";
import type { OverlayWindowChannel } from "@/features/overlay-controls/runtime/overlay-windows";

// Backstop for a morph that never reports completion (interrupted animation,
// detached surface): the window must not stay at its transition size.
const MORPH_SETTLE_TIMEOUT_MS = 900;

interface NativeOverlayTransitionOptions<Mode extends OverlayMode> {
  channel: OverlayWindowChannel;
  initialMode: Mode;
  /// `null` leaves the window untouched: the surface is on its way out and
  /// keeps the frame it already holds until the exit animation is over.
  mode: Mode | null;
}

export const useNativeOverlayTransition = <Mode extends OverlayMode>({
  channel,
  initialMode,
  mode,
}: NativeOverlayTransitionOptions<Mode>) => {
  const [state, dispatch] = useReducer(
    reduceNativeOverlayTransition<Mode>,
    initialMode,
    initialNativeOverlayTransition<Mode>
  );
  const generationRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (mode === null) {
      return;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    dispatch({ generation, type: "prepare_started" });
    invoke(channel.prepareCommand, { mode })
      .then(() =>
        dispatch({ error: null, generation, mode, type: "prepare_finished" })
      )
      .catch(() =>
        dispatch({
          error: nativeOverlayFailureMessage,
          generation,
          mode,
          type: "prepare_finished",
        })
      );
  }, [channel.prepareCommand, mode]);

  const settle = useEffectEvent((generation: number) => {
    const settling = nativeOverlayModeToSettle(stateRef.current, generation);
    if (settling === null) {
      return;
    }
    invoke(channel.settleCommand, { mode: settling })
      .then(() =>
        dispatch({ error: null, generation, type: "settle_finished" })
      )
      .catch(() =>
        dispatch({
          error: nativeOverlayFailureMessage,
          generation,
          type: "settle_finished",
        })
      );
  });

  const morphingGeneration =
    state.phase === "morphing" ? state.staged.generation : null;
  useEffect(() => {
    if (morphingGeneration === null) {
      return;
    }
    const timer = setTimeout(
      () => settle(morphingGeneration),
      MORPH_SETTLE_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [morphingGeneration]);

  return {
    dismissError: () => dispatch({ type: "error_dismissed" }),
    error: state.error,
    phase: state.phase,
    settle,
    staged: state.staged,
  };
};
