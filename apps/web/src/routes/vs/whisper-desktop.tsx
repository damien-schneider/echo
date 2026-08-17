"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/whisper-desktop")({
  component: WhisperDesktopPage,
  head: () => ({
    meta: [
      {
        title:
          "Echo vs Whisper Desktop — Better Whisper App for Daily Dictation",
      },
      {
        content:
          "Echo is the best Whisper app for Mac and Windows daily use. Global shortcuts, auto-paste, VAD, LLM refinement, and a polished UI — all free and offline.",
        name: "description",
      },
      {
        content:
          "Echo vs Whisper Desktop — Better Whisper App for Daily Dictation",
        property: "og:title",
      },
      {
        content:
          "Echo is the best Whisper app for Mac and Windows daily use. Global shortcuts, auto-paste, VAD, LLM refinement, and a polished UI — all free and offline.",
        property: "og:description",
      },
    ],
  }),
});

const COMPARISON_ROWS = [
  {
    competitor: "Free (but limited functionality)",
    echo: "Free forever",
    echoPositive: true,
    feature: "Price",
  },
  {
    competitor: "None — manual UI interaction only",
    echo: "Push-to-talk from any app",
    echoPositive: true,
    feature: "Global Shortcuts",
  },
  {
    competitor: "Copy-paste workflow required",
    echo: "Instantly pastes into focused app",
    echoPositive: true,
    feature: "Auto-Paste",
  },
  {
    competitor: "No VAD support",
    echo: "Built-in VAD, stops on silence",
    echoPositive: true,
    feature: "Voice Activity Detection",
  },
  {
    competitor: "Raw Whisper output only",
    echo: "Optional AI refinement of transcripts",
    echoPositive: true,
    feature: "LLM Post-Processing",
  },
  {
    competitor: "100% local processing",
    echo: "100% local processing",
    echoPositive: false,
    feature: "Offline / Private",
  },
  {
    competitor: "Open source (MIT)",
    echo: "MIT License",
    echoPositive: false,
    feature: "Open Source",
  },
  {
    competitor: "macOS, Windows",
    echo: "macOS, Windows, Linux",
    echoPositive: true,
    feature: "Platforms",
  },
  {
    competitor: "Whisper models, manual setup",
    echo: "Whisper Small, Medium, or Large with in-app downloads",
    echoPositive: true,
    feature: "Model Selection",
  },
  {
    competitor: "Functional but minimal",
    echo: "Modern, animated, system-aware",
    echoPositive: true,
    feature: "UI Polish",
  },
  {
    competitor: "Less actively maintained",
    echo: "Actively developed with regular updates",
    echoPositive: true,
    feature: "Active Maintenance",
  },
  {
    competitor: "More technical setup required",
    echo: "Download and run — no config needed",
    echoPositive: true,
    feature: "Setup Complexity",
  },
];

const WIN_CARDS = [
  {
    description:
      "Assign a keyboard shortcut and dictate into any app — email, Slack, docs, code editors. Echo auto-pastes the transcript the moment you finish speaking, with no manual copying.",
    icon: "⌨",
    title: "Global Shortcuts & Auto-Paste",
  },
  {
    description:
      "Echo detects when you stop speaking and automatically ends the recording session. No need to manually hit stop — just speak naturally and Echo handles the rest.",
    icon: "◉",
    title: "Voice Activity Detection",
  },
  {
    description:
      "Optionally run your transcript through a local LLM to fix punctuation, remove filler words, or reformat text. Whisper Desktop gives you raw output; Echo gives you polished results.",
    icon: "✦",
    title: "LLM Refinement",
  },
];

function ComparisonTable() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-80px", once: true });

  return (
    <motion.div
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      initial={{ opacity: 0, y: 24 }}
      ref={ref}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="px-6 py-4 text-left font-display font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Feature
              </th>
              <th className="bg-brand/10 px-6 py-4 text-left font-display font-semibold text-foreground text-xs uppercase tracking-wider">
                Echo
              </th>
              <th className="px-6 py-4 text-left font-display font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Whisper Desktop
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row, index) => (
              <tr
                className={`border-border border-b last:border-0 ${index % 2 === 0 ? "bg-background" : "bg-card/40"}`}
                key={row.feature}
              >
                <td className="px-6 py-4 font-medium text-foreground">
                  {row.feature}
                </td>
                <td className="bg-brand/5 px-6 py-4">
                  {row.echoPositive ? (
                    <span className="font-medium text-foreground">
                      <span className="mr-1.5 text-accent">✓</span>
                      {row.echo}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      <span className="mr-1.5">✓</span>
                      {row.echo}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-muted-foreground">
                  {row.echoPositive ? (
                    <>
                      <span className="mr-1.5 text-destructive-foreground">
                        ✗
                      </span>
                      {row.competitor}
                    </>
                  ) : (
                    <>
                      <span className="mr-1.5">✓</span>
                      {row.competitor}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function WinCards() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-60px", once: true });

  return (
    <div className="grid gap-6 md:grid-cols-3" ref={ref}>
      {WIN_CARDS.map((card, index) => (
        <motion.div
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          initial={{ opacity: 0, y: 24 }}
          key={card.title}
          transition={{
            delay: index * 0.1,
            duration: 0.5,
            ease: "easeOut",
          }}
        >
          <div className="flex h-full flex-col rounded-2xl border border-border/60 bg-card p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 font-display text-foreground text-lg">
              {card.icon}
            </div>
            <h3 className="mb-2 font-bold font-display text-foreground text-lg tracking-tight">
              {card.title}
            </h3>
            <p className="flex-1 font-body text-muted-foreground text-sm leading-relaxed">
              {card.description}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function WhisperDesktopPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const heroInView = useInView(heroRef, { once: true });

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <main className="pt-24">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-16 pb-12">
          <motion.div
            animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            initial={{ opacity: 0, y: 24 }}
            ref={heroRef}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="mb-5 inline-block rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-body text-foreground text-sm">
              Echo vs Whisper Desktop
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              The best Whisper app{" "}
              <span className="font-display font-light text-muted-foreground italic">
                for daily dictation
              </span>
            </h1>
            <p className="mb-8 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              Whisper Desktop gets the model right but stops short of making it
              usable day-to-day. Echo adds global shortcuts, instant auto-paste,
              voice activity detection, and LLM-powered refinement — turning
              Whisper into a seamless dictation workflow you'll actually reach
              for.
            </p>
            <Button asChild size="lg">
              <Link hash="download" to="/">
                Download Echo Free
              </Link>
            </Button>
          </motion.div>
        </section>

        {/* Winner summary bar */}
        <section className="border-border border-y bg-card/40 py-5">
          <div className="mx-auto max-w-5xl px-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-body font-semibold text-muted-foreground text-sm">
                Echo wins on:
              </span>
              {[
                "Global Shortcuts",
                "Auto-Paste",
                "VAD",
                "LLM Refinement",
                "Polished UI",
                "Active Development",
              ].map((badge) => (
                <span
                  className="rounded-full border border-brand/25 bg-brand/10 px-3 py-1 font-body font-medium text-foreground text-xs"
                  key={badge}
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section className="mx-auto max-w-5xl px-4 py-16">
          <motion.h2
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 font-bold font-display text-2xl text-foreground tracking-tight md:text-3xl"
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5 }}
          >
            Feature by feature
          </motion.h2>
          <ComparisonTable />
        </section>

        {/* Why Echo wins */}
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <motion.h2
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 font-bold font-display text-2xl text-foreground tracking-tight md:text-3xl"
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5 }}
          >
            Where Echo goes further
          </motion.h2>
          <WinCards />
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-5xl px-4 pb-24">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card px-8 py-14 text-center"
            initial={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <h2 className="font-bold font-display text-2xl text-foreground tracking-tight md:text-3xl">
              Ready to upgrade your Whisper experience?
            </h2>
            <p className="max-w-sm font-body text-muted-foreground text-sm">
              Echo turns Whisper into a real daily dictation tool. Free,
              open-source, and 100% offline.
            </p>
            <Button asChild className="mt-2" size="lg">
              <Link hash="download" to="/">
                Download Echo Free
              </Link>
            </Button>
            <p className="font-body text-muted-foreground text-xs">
              Free forever · MIT License ·{" "}
              <a
                className="hover:underline"
                href="https://github.com/damien-schneider/Echo"
                rel="noopener noreferrer"
                target="_blank"
              >
                Open source on GitHub
              </a>
            </p>
          </motion.div>
        </section>
      </main>
      <EchoFooter />
    </div>
  );
}
