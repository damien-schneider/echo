"use client";

import { ArrowRight, Star } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { useGithubData } from "@/hooks/use-github-data";

const stats = [
  {
    detail: "Zero bytes sent to any server",
    label: "Offline",
    value: "100%",
  },
  {
    detail: "Via Whisper & Parakeet models",
    label: "Languages",
    value: "100+",
  },
  {
    detail: "Fork it. Ship it. It's yours.",
    label: "Licensed",
    value: "MIT",
  },
];

export default function Stats() {
  const { stars } = useGithubData();
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { margin: "-100px", once: true });

  return (
    <section className="bg-background py-32 text-foreground" ref={containerRef}>
      <div className="container mx-auto px-4">
        {/* Stats as a tight horizontal band */}
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border md:grid-cols-3">
          {stats.map((stat, index) => (
            <motion.div
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              className="flex flex-col gap-1 bg-secondary/40 p-8 dark:bg-muted/20"
              initial={{ opacity: 0, y: 16 }}
              key={stat.label}
              transition={{
                delay: index * 0.1,
                duration: 0.5,
                ease: "easeOut",
              }}
            >
              <span className="font-display text-4xl tracking-tight md:text-5xl">
                {stat.value}
              </span>
              <span className="font-medium text-foreground text-sm">
                {stat.label}
              </span>
              <span className="text-muted-foreground text-xs">
                {stat.detail}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Closing CTA — confident, not desperate */}
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          className="mx-auto mt-24 max-w-xl text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
        >
          <h2 className="font-display text-3xl tracking-tight md:text-5xl">
            Your voice stays with you
          </h2>
          <p className="mt-4 text-muted-foreground">
            The speech-to-text tool that respects your data. No accounts, no
            tracking, no cloud — just your words on your machine.
          </p>

          <a
            className="mt-8 inline-block rounded-full bg-foreground px-8 py-3.5 font-medium text-background text-sm transition-all duration-300 hover:opacity-90 active:scale-[0.98]"
            href="#download"
          >
            Download for free
          </a>

          <div className="mt-6 flex items-center justify-center gap-4">
            <a
              className="flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
              href="https://github.com/damien-schneider/Echo"
              rel="noopener noreferrer"
              target="_blank"
            >
              <div className="flex">
                <Star className="h-3.5 w-3.5 fill-current text-yellow-500" />
                <Star className="h-3.5 w-3.5 fill-current text-yellow-500" />
                <Star className="h-3.5 w-3.5 fill-current text-yellow-500" />
                <Star className="h-3.5 w-3.5 fill-current text-yellow-500" />
                <Star className="h-3.5 w-3.5 fill-current text-yellow-500" />
              </div>
              <span className="text-foreground text-xs">
                {stars ? `${stars} stars on GitHub` : "Star on GitHub"}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
