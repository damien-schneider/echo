"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useScroll,
  useTransform,
} from "motion/react";
import { useRef, useState } from "react";

interface ModelData {
  accuracy: number;
  engine: string;
  id: string;
  name: string;
  recommended?: boolean;
  size: string;
  speed: number;
  tagline: string;
}

const models: ModelData[] = [
  {
    accuracy: 60,
    engine: "OpenAI Whisper",
    id: "whisper-small",
    name: "Whisper Small",
    size: "190 MB",
    speed: 85,
    tagline: "Fast multilingual transcription for lower-memory computers",
  },
  {
    accuracy: 75,
    engine: "OpenAI Whisper",
    id: "whisper-medium",
    name: "Whisper Medium",
    recommended: true,
    size: "574 MB",
    speed: 60,
    tagline: "The best balance of multilingual accuracy and speed",
  },
  {
    accuracy: 85,
    engine: "OpenAI Whisper",
    id: "whisper-large",
    name: "Whisper Large",
    size: "1.1 GB",
    speed: 30,
    tagline: "The highest multilingual accuracy",
  },
];

function ProgressBar({
  value,
  delay,
  color,
}: {
  value: number;
  delay: number;
  color: string;
}) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/5">
      <motion.div
        animate={{ width: `${value}%` }}
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        transition={{ delay, duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

export default function ModelsShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { margin: "-100px", once: true });
  const [active, setActive] = useState(0);
  const model = models[active];

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: containerRef,
  });

  const titleY = useTransform(scrollYProgress, [0, 0.4], [40, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.2], [0, 1]);

  return (
    <section
      className="overflow-hidden bg-background py-24 text-foreground md:py-32"
      ref={containerRef}
    >
      <div className="container mx-auto px-4">
        <motion.div
          className="mb-20 text-center"
          style={{ opacity: titleOpacity, y: titleY }}
        >
          <h2 className="font-bold font-display text-[clamp(1.8rem,4vw,3.2rem)] leading-tight tracking-[-0.03em]">
            Three sizes,{" "}
            <span className="font-display font-light text-muted-foreground italic">
              one shortcut
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-sm">
            Choose faster local transcription or higher multilingual accuracy.
            Every model runs on this computer.
          </p>
        </motion.div>

        <div className="mx-auto max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
              className="mb-16 text-center"
              exit={{ filter: "blur(4px)", opacity: 0, y: -8 }}
              initial={{ filter: "blur(4px)", opacity: 0, y: 8 }}
              key={model.id}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-6 inline-flex items-center gap-3">
                {model.recommended && (
                  <span className="rounded-full bg-brand px-2.5 py-0.5 font-medium text-[10px] text-white uppercase tracking-wider">
                    Recommended
                  </span>
                )}
                <span className="rounded-full border border-foreground/10 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                  {model.engine}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {model.size}
                </span>
              </div>

              <h3 className="mb-2 font-display text-5xl tracking-tight md:text-7xl">
                {model.name}
              </h3>
              <p className="text-muted-foreground">{model.tagline}</p>

              <div className="mx-auto mt-10 grid max-w-sm grid-cols-2 gap-8">
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-muted-foreground text-xs">
                      Accuracy
                    </span>
                    <span className="font-mono text-foreground text-xs tabular-nums">
                      {model.accuracy}%
                    </span>
                  </div>
                  <ProgressBar
                    color="bg-foreground"
                    delay={0.1}
                    value={model.accuracy}
                  />
                </div>
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-muted-foreground text-xs">Speed</span>
                    <span className="font-mono text-foreground text-xs tabular-nums">
                      {model.speed}%
                    </span>
                  </div>
                  <ProgressBar
                    color="bg-brand"
                    delay={0.2}
                    value={model.speed}
                  />
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <motion.div
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            className="flex flex-wrap items-center justify-center gap-2"
            initial={{ opacity: 0, y: 16 }}
            transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
          >
            {models.map((m, i) => (
              <button
                className={`relative cursor-pointer rounded-full px-4 py-2 text-sm transition-all duration-300 ${
                  i === active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/70"
                }`}
                key={m.id}
                onClick={() => setActive(i)}
                type="button"
              >
                {i === active && (
                  <motion.div
                    className="absolute inset-0 rounded-full border border-foreground/15 bg-foreground/5"
                    layoutId="model-pill"
                    transition={{
                      damping: 30,
                      stiffness: 400,
                      type: "spring",
                    }}
                  />
                )}
                <span className="relative z-10">{m.name}</span>
              </button>
            ))}
          </motion.div>

          <motion.p
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            className="mt-12 text-center text-muted-foreground/60 text-xs"
            initial={{ opacity: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            All models are downloaded once and run entirely on your device.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
