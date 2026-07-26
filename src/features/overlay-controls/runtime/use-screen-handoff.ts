import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  SCREEN_HANDOFF_ARRIVAL_MS,
  SCREEN_HANDOFF_COMMAND,
  SCREEN_HANDOFF_EVENT,
  SCREEN_HANDOFF_FADE_MS,
  type ScreenHandoffPhase,
} from "@/features/overlay-controls/runtime/screen-handoff";
import { listenCancellable } from "@/lib/tauri-listener";

// Rust never moves the island under an in-flight animation: it asks, the island
// fades out, and the move happens while nothing is on screen.
export const useScreenHandoff = () => {
  const [phase, setPhase] = useState<ScreenHandoffPhase>("idle");
  const step = useRef<ReturnType<typeof setTimeout>>(undefined);

  const scheduleStep = (delay: number, next: () => void) => {
    clearTimeout(step.current);
    step.current = setTimeout(next, delay);
  };

  const arrive = () => {
    setPhase("arriving");
    scheduleStep(SCREEN_HANDOFF_ARRIVAL_MS, () => setPhase("idle"));
  };

  // A refused move still has to bring the island back: an invisible HUD is
  // worse than one on the wrong screen.
  const moveToCursorScreen = () =>
    invoke(SCREEN_HANDOFF_COMMAND)
      .catch(() => undefined)
      .then(arrive);

  const beginHandoff = useEffectEvent(() => {
    setPhase("leaving");
    scheduleStep(SCREEN_HANDOFF_FADE_MS, moveToCursorScreen);
  });

  useEffect(() => {
    const stopListening = listenCancellable(() =>
      listen(SCREEN_HANDOFF_EVENT, () => beginHandoff())
    );
    return () => {
      stopListening();
      clearTimeout(step.current);
    };
  }, []);

  return phase;
};
