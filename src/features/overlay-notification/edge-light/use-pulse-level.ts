import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect } from "react";

const PULSE_LEVELS = [0.3, 0.8, 0.45, 0.95, 0.35, 0.7, 0.3];
const PULSING = {
  duration: 2.8,
  ease: "easeInOut",
  repeat: Number.POSITIVE_INFINITY,
} as const;
const RESTING_LEVEL = 0.55;

export const usePulseLevel = (isPulsing: boolean) => {
  const level = useMotionValue(RESTING_LEVEL);
  const isReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isPulsing || isReducedMotion) {
      level.set(RESTING_LEVEL);
      return;
    }
    const pulse = animate(level, PULSE_LEVELS, PULSING);
    return () => pulse.stop();
  }, [isPulsing, isReducedMotion, level]);

  return level;
};
