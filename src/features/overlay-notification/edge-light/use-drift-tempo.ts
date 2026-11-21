import { type MotionValue, useMotionValueEvent, useSpring } from "motion/react";
import { useEffect, useRef } from "react";
import type { IslandEdge } from "@/features/overlay-controls/recording-overlay-state";

const DRIFT_TEMPO = 1;
const CALM_TEMPO = 0.7;
const LOUD_TEMPO = 2.2;
const TEMPO_STEPS_PER_UNIT = 20;
const TEMPO_SPRING = { damping: 16, stiffness: 60 } as const;

const tempoFor = (level: number) =>
  CALM_TEMPO + level * (LOUD_TEMPO - CALM_TEMPO);

const driftAnimations = (edge: Element) =>
  edge
    .getAnimations({ subtree: true })
    .filter(
      (animation) =>
        animation instanceof CSSAnimation &&
        animation.animationName.startsWith("echo-island-drift")
    );

/// Rate, not duration: a new duration jumps a running keyframe, a new rate carries on from where it is.
export const useDriftTempo = (
  edge: IslandEdge | null,
  voice: MotionValue<number>
) => {
  const edgeRef = useRef<HTMLSpanElement>(null);
  const appliedTempo = useRef(DRIFT_TEMPO);
  const tempo = useSpring(DRIFT_TEMPO, TEMPO_SPRING);

  useEffect(() => {
    if (edge !== "voice") {
      tempo.set(DRIFT_TEMPO);
      return;
    }
    tempo.set(tempoFor(voice.get()));
    return voice.on("change", (level) => tempo.set(tempoFor(level)));
  }, [edge, tempo, voice]);

  useMotionValueEvent(tempo, "change", (rate) => {
    const stepped =
      Math.round(rate * TEMPO_STEPS_PER_UNIT) / TEMPO_STEPS_PER_UNIT;
    const element = edgeRef.current;
    if (element === null || stepped === appliedTempo.current) {
      return;
    }
    appliedTempo.current = stepped;
    for (const animation of driftAnimations(element)) {
      animation.updatePlaybackRate(stepped);
    }
  });

  return edgeRef;
};
