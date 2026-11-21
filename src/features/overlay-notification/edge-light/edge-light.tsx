import {
  AnimatePresence,
  type MotionStyle,
  type MotionValue,
  m,
  useIsPresent,
} from "motion/react";
import type { IslandEdge } from "@/features/overlay-controls/recording-overlay-state";
import "@/features/overlay-notification/edge-light/edge-light.css";
import { useDriftTempo } from "@/features/overlay-notification/edge-light/use-drift-tempo";

const EDGE_HANDOFF = {
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  initial: { opacity: 0 },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
} as const;

interface EdgeLightProps {
  edge: IslandEdge | null;
  voice: MotionValue<number>;
}

interface VoiceGlowStyle extends MotionStyle {
  "--echo-voice": MotionValue<number>;
}

const Threads = () => (
  <>
    <span />
    <span />
    <span />
  </>
);

export const EdgeLight = ({ edge, voice }: EdgeLightProps) => {
  const isIslandPresent = useIsPresent();
  const shownEdge = isIslandPresent ? edge : null;
  const edgeRef = useDriftTempo(shownEdge, voice);
  const voiceGlow: VoiceGlowStyle = { "--echo-voice": voice };
  return (
    <AnimatePresence initial={false}>
      {shownEdge === null ? null : (
        <m.span
          aria-hidden="true"
          className="echo-island-edge"
          data-edge={shownEdge}
          key="edge"
          ref={edgeRef}
          style={voiceGlow}
          {...EDGE_HANDOFF}
        >
          <span className="echo-island-edge-haze">
            <Threads />
          </span>
          <span className="echo-island-edge-rim">
            <Threads />
          </span>
          <span className="echo-island-edge-trace" />
        </m.span>
      )}
    </AnimatePresence>
  );
};
