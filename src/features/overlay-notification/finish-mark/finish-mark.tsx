import {
  animate,
  type MotionValue,
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect } from "react";
import {
  LANDED,
  LOADER_PATH,
  ORBIT,
  ORBIT_LEAD,
  ORBIT_START,
  PATH_SPAN,
  RING_RADIUS,
} from "@/features/overlay-notification/finish-mark/finish-mark-path";
import { liveMarkPath } from "@/features/overlay-notification/finish-mark/finish-mark-wave";
import { useVoicePause } from "@/features/overlay-notification/finish-mark/use-voice-pause";
import "@/features/overlay-notification/finish-mark/finish-mark.css";

type FinishStage = "check" | "loading" | "wave";

const LAP_SECONDS = 1.2;
const ORBITING = {
  delay: -ORBIT_LEAD * LAP_SECONDS,
  duration: LAP_SECONDS,
  ease: "linear",
  repeat: Number.POSITIVE_INFINITY,
} as const;
const LANDING = { bounce: 0, duration: 0.5, type: "spring" } as const;
const FOLDING = { bounce: 0, duration: 0.45, type: "spring" } as const;
const SWELLING = { duration: 0.4, ease: [0.22, 1, 0.36, 1] } as const;
const RIPPLING = {
  duration: 1.1,
  ease: "linear",
  repeat: Number.POSITIVE_INFINITY,
} as const;
const SETTLED = { duration: 0 } as const;
const VOICE_FOLLOW = { damping: 24, stiffness: 300 } as const;
const QUIET_AMPLITUDE = 0.5;
const VOICE_AMPLITUDE = 3.5;

const useLoaderStroke = (isLoading: boolean, isReducedMotion: boolean) => {
  const head = useMotionValue(ORBIT_START.head);
  const tail = useMotionValue(ORBIT_START.tail);
  const landed = useMotionValue(isLoading ? 0 : 1);
  const presence = useMotionValue(isLoading ? 0 : 1);

  useEffect(() => {
    if (landed.get() === 1 || (isLoading && isReducedMotion)) {
      return;
    }
    const land = () => {
      landed.set(1);
      animate(presence, 1, isReducedMotion ? SETTLED : SWELLING);
    };
    const landing = isReducedMotion ? SETTLED : LANDING;
    const runs = isLoading
      ? [
          animate(head, ORBIT.head, ORBITING),
          animate(tail, ORBIT.tail, ORBITING),
        ]
      : [
          animate(head, LANDED.head, { ...landing, onComplete: land }),
          animate(tail, LANDED.tail, landing),
        ];
    return () => {
      for (const run of runs) {
        run.stop();
      }
    };
  }, [head, isLoading, isReducedMotion, landed, presence, tail]);

  return {
    landed,
    presence,
    style: {
      opacity: useTransform(() => 1 - landed.get()),
      strokeDasharray: useTransform(
        () => `${head.get() - tail.get()} ${PATH_SPAN}`
      ),
      strokeDashoffset: useTransform(() => -tail.get()),
    },
  };
};

interface LiveStrokeOptions {
  isReducedMotion: boolean;
  presence: MotionValue<number>;
  stage: FinishStage;
  voice: MotionValue<number>;
}

const useLiveStroke = ({
  isReducedMotion,
  presence,
  stage,
  voice,
}: LiveStrokeOptions) => {
  const isCheck = stage === "check";
  const isRippling = stage === "wave" && !isReducedMotion;
  const fold = useMotionValue(isCheck ? 1 : 0);
  const phase = useMotionValue(0);
  const level = useSpring(voice, VOICE_FOLLOW);

  useEffect(() => {
    const run = animate(
      fold,
      isCheck ? 1 : 0,
      isReducedMotion ? SETTLED : FOLDING
    );
    return () => run.stop();
  }, [fold, isCheck, isReducedMotion]);

  useEffect(() => {
    if (!isRippling) {
      return;
    }
    const from = phase.get();
    const run = animate(phase, [from, from + 1], RIPPLING);
    return () => run.stop();
  }, [isRippling, phase]);

  return useTransform(() =>
    liveMarkPath({
      amplitude:
        presence.get() * (QUIET_AMPLITUDE + level.get() * VOICE_AMPLITUDE),
      fold: fold.get(),
      phase: phase.get(),
    })
  );
};

interface FinishMarkProps {
  hasText: boolean;
  isHovered: boolean;
  isLoading: boolean;
  voice: MotionValue<number>;
}

const stageOf = (
  { hasText, isHovered, isLoading }: Omit<FinishMarkProps, "voice">,
  isPaused: boolean
): FinishStage => {
  if (isLoading) {
    return "loading";
  }
  return isHovered || (hasText && isPaused) ? "check" : "wave";
};

export const FinishMark = (props: FinishMarkProps) => {
  const { isLoading, voice } = props;
  const isReducedMotion = useReducedMotion() ?? false;
  const stage = stageOf(props, useVoicePause(voice));
  const loader = useLoaderStroke(isLoading, isReducedMotion);
  const live = useLiveStroke({
    isReducedMotion,
    presence: loader.presence,
    stage,
    voice,
  });
  const liveStyle = { opacity: loader.landed };

  return (
    <svg
      aria-hidden="true"
      className="echo-finish-mark"
      data-stage={stage}
      viewBox="0 0 24 24"
    >
      <circle
        className="echo-finish-mark-track"
        cx="12"
        cy="12"
        r={RING_RADIUS}
      />
      <m.path
        className="echo-finish-mark-loader"
        d={LOADER_PATH}
        style={loader.style}
      />
      <m.path className="echo-finish-mark-live" d={live} style={liveStyle} />
    </svg>
  );
};
