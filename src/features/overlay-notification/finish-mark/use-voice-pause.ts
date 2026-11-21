import type { MotionValue } from "motion/react";
import { useEffect, useState } from "react";

const SPEAKING_LEVEL = 0.2;
const PAUSE_MS = 800;

/// Arms on the drop below speech, not per sample: a voice held at the clamp sends no change events.
export const useVoicePause = (voice: MotionValue<number>) => {
  const [isPaused, setPaused] = useState(true);

  useEffect(() => {
    let pause: ReturnType<typeof setTimeout> | undefined;
    const stopWatching = voice.on("change", (level) => {
      if (level >= SPEAKING_LEVEL) {
        clearTimeout(pause);
        pause = undefined;
        setPaused(false);
        return;
      }
      pause ??= setTimeout(() => setPaused(true), PAUSE_MS);
    });
    return () => {
      stopWatching();
      clearTimeout(pause);
    };
  }, [voice]);

  return isPaused;
};
