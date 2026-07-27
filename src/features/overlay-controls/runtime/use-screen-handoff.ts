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

// Rust asks first — the island fades out and moves while nothing is on screen
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

  // a refused move must still bring the island back — invisible beats wrong screen
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
