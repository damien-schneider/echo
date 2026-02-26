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
    id: "parakeet-v3",
    name: "Parakeet V3",
    tagline: "Fast, accurate, auto-detects language",
    accuracy: 80,
    speed: 85,
    size: "478 MB",
    engine: "NVIDIA Parakeet",
    recommended: true,
  },
  {
    id: "parakeet-v2",
    name: "Parakeet V2",
    tagline: "Highest accuracy for English",
    accuracy: 85,
    speed: 85,
    size: "473 MB",
    engine: "NVIDIA Parakeet",
  },
  {
    id: "whisper-small",
    name: "Whisper Small",
    tagline: "Lightweight, 100+ languages",
    accuracy: 60,
    speed: 85,
    size: "487 MB",
    engine: "OpenAI Whisper",
  },
  {
    id: "whisper-medium",
    name: "Whisper Medium",
    tagline: "Balanced accuracy and speed",
    accuracy: 75,
    speed: 60,
    size: "492 MB",
    engine: "OpenAI Whisper",
  },
  {
    id: "whisper-turbo",
    name: "Whisper Turbo",
    tagline: "High quality, GPU accelerated",
    accuracy: 80,
    speed: 40,
    size: "1.6 GB",
    engine: "OpenAI Whisper",
  },
  {
    id: "whisper-large",
    name: "Whisper Large",
    tagline: "Maximum accuracy across all languages",
    accuracy: 85,
    speed: 30,
    size: "1.1 GB",
    engine: "OpenAI Whisper",
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
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
      />
    </div>
  );
}

export default function ModelsShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });
  const [active, setActive] = useState(0);
  const model = models[active];

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
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
          style={{ y: titleY, opacity: titleOpacity }}
        >
          <h2 className="font-bold font-display text-[clamp(1.8rem,4vw,3.2rem)] leading-tight tracking-[-0.03em]">
            Six engines,{" "}
            <span className="font-display font-light text-muted-foreground italic">
              one shortcut
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-sm">
            From lightning-fast CPU models to high-accuracy GPU options. All run
            100% locally — pick one and forget about it.
          </p>
        </motion.div>

        <div className="mx-auto max-w-3xl">
          {/* Active model detail — large, minimal */}
          <AnimatePresence mode="wait">
            <motion.div
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              className="mb-16 text-center"
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
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

              {/* Accuracy / Speed bars */}
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

          {/* Model selector — horizontal pills */}
          <motion.div
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            className="flex flex-wrap items-center justify-center gap-2"
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
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
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
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
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            All models are downloaded once and run entirely on your device.
          </motion.p>
        </div>
      </div>
    </section>
  );
}
