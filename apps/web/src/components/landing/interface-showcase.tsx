"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

export default function InterfaceShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section
      className="relative overflow-hidden bg-linear-to-b from-background via-neutral-500/10 to-background py-24 md:py-32"
      ref={containerRef}
    >
      {/* Ambient glow effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          className="mb-12 text-center md:mb-16"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h2 className="mb-4 font-medium text-3xl text-foreground lg:text-5xl">
            Beautiful & Intuitive
          </h2>
          <p className="mx-auto max-w-2xl font-light text-muted-foreground text-sm md:text-base">
            A clean, native interface that stays out of your way. Configure your
            shortcuts, choose your microphone, and start transcribing in
            seconds.
          </p>
        </motion.div>

        <motion.div
          animate={
            isInView
              ? { opacity: 1, y: 0, scale: 1 }
              : { opacity: 0, y: 48, scale: 0.95 }
          }
          className="relative mx-auto max-w-5xl"
          initial={{ opacity: 0, y: 48, scale: 0.95 }}
          transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
        >
          {/* Glow behind the image */}
          <div className="absolute inset-0 scale-95 transform rounded-3xl bg-linear-to-t from-primary/20 via-primary/5 to-transparent blur-2xl" />

          {/* Main image container */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
            <img
              alt="Echo app interface showing the settings panel with options for shortcuts, language, microphone selection, and audio feedback"
              className="h-auto w-full"
              height={630}
              loading="lazy"
              src="/opengraph-image.png"
              width={1200}
            />

            {/* Subtle overlay gradient for depth */}
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/20 via-transparent to-transparent" />
          </div>

          {/* Floating feature badges */}
          <motion.div
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            className="absolute top-1/4 -left-4 hidden items-center gap-2 rounded-full border border-white/10 bg-background/80 px-4 py-2 shadow-lg backdrop-blur-md lg:flex"
            initial={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="font-medium text-foreground text-sm">
              Push to Talk
            </span>
          </motion.div>

          <motion.div
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
            className="absolute top-1/3 -right-4 hidden items-center gap-2 rounded-full border border-white/10 bg-background/80 px-4 py-2 shadow-lg backdrop-blur-md lg:flex"
            initial={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="font-medium text-foreground text-sm">
              Custom Shortcuts
            </span>
          </motion.div>

          <motion.div
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            className="absolute -bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-background/80 px-4 py-2 shadow-lg backdrop-blur-md lg:flex"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 1 }}
          >
            <div className="h-2 w-2 rounded-full bg-purple-500" />
            <span className="font-medium text-foreground text-sm">
              Audio Feedback
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
