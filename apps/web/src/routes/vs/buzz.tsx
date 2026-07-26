"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/buzz")({
  component: BuzzPage,
  head: () => ({
    meta: [
      {
        title: "Echo vs Buzz — Better Whisper GUI for Daily Dictation",
      },
      {
        content:
          "Buzz is great for file transcription. Echo adds global auto-paste dictation, VAD, and LLM post-processing for a true speak-and-it-types workflow. Both free and open source.",
        name: "description",
      },
      {
        content: "Echo vs Buzz — Better Whisper GUI for Daily Dictation",
        property: "og:title",
      },
      {
        content:
          "Buzz is great for file transcription. Echo adds global auto-paste dictation, VAD, and LLM post-processing for a true speak-and-it-types workflow. Both free and open source.",
        property: "og:description",
      },
    ],
  }),
});

const COMPARISON_ROWS = [
  {
    competitor: "Free forever",
    echo: "Free forever",
    echoPositive: false,
    feature: "Price",
  },
  {
    competitor: "MIT License (github.com/chidiwilliams/buzz)",
    echo: "MIT License",
    echoPositive: false,
    feature: "Open Source",
  },
  {
    competitor: "macOS, Windows, Linux",
    echo: "macOS, Windows, Linux",
    echoPositive: false,
    feature: "Platforms",
  },
  {
    competitor: "Never",
    echo: "Never",
    echoPositive: false,
    feature: "Account Required",
  },
  {
    competitor: "Limited — no clean global dictation",
    echo: "Yes — speak and it types in any app",
    echoPositive: true,
    feature: "Global Shortcut + Auto-Paste",
  },
  {
    competitor: "Manual recording",
    echo: "Yes — auto-detects speech",
    echoPositive: true,
    feature: "Voice Activity Detection",
  },
  {
    competitor: "Not available",
    echo: "Yes — optional AI refinement",
    echoPositive: true,
    feature: "LLM Post-Processing",
  },
  {
    competitor: "100% local (multiple backends)",
    echo: "100% local",
    echoPositive: false,
    feature: "Offline Processing",
  },
  {
    competitor: "Whisper, whisper.cpp, faster-whisper, HuggingFace, OpenAI API",
    echo: "Whisper + Parakeet",
    echoPositive: false,
    feature: "Whisper Backends",
  },
  {
    competitor: "1000+ languages via Meta MMS models",
    echo: "100+ languages via Whisper",
    echoPositive: false,
    feature: "Language Support",
  },
  {
    competitor: "SRT, VTT, TXT, and more",
    echo: "Not available",
    echoPositive: false,
    feature: "Export Formats",
  },
  {
    competitor: "Yes",
    echo: "Not available",
    echoPositive: false,
    feature: "Batch File Processing",
  },
];

const WIN_CARDS = [
  {
    description:
      "Buzz is excellent for transcribing files — but the workflow Echo is built for is different: press shortcut, speak, it types directly into your email, code editor, or document. This 'speak and it types' flow is Echo's core purpose.",
    icon: "◈",
    title: "Designed for Daily Dictation",
  },
  {
    description:
      "Echo's global shortcut triggers dictation and automatically pastes the result into whatever app has focus. No copy-paste step, no switching windows. Buzz doesn't offer this out of the box.",
    icon: "⊕",
    title: "Auto-Paste Into Any App",
  },
  {
    description:
      "Echo automatically detects when you start and stop speaking using VAD, then optionally passes your transcription through a local LLM to clean up punctuation and remove filler words. Buzz requires manual recording controls.",
    icon: "✦",
    title: "Voice Activity Detection + LLM",
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
                Buzz
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
                      <span className="mr-1.5 text-green-600 dark:text-green-400">
                        ✓
                      </span>
                      {row.echo}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      <span className="mr-1.5 text-green-600 dark:text-green-400">
                        ✓
                      </span>
                      {row.echo}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-muted-foreground">
                  {row.echoPositive ? (
                    <>
                      <span className="mr-1.5 text-destructive">✗</span>
                      {row.competitor}
                    </>
                  ) : (
                    <>
                      <span className="mr-1.5 text-green-600 dark:text-green-400">
                        ✓
                      </span>
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

function BuzzPage() {
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
              Echo vs Buzz
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              Two great open-source tools,{" "}
              <span className="font-display font-light text-muted-foreground italic">
                different use cases
              </span>
            </h1>
            <p className="mb-4 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              Buzz is a capable open-source Whisper GUI for transcribing files —
              with impressive model backend support and export options. Echo is
              built for the "speak and it types for you" workflow: global
              shortcut, auto-paste, VAD, and LLM refinement, optimized for daily
              dictation.
            </p>
            <p className="mb-8 max-w-2xl rounded-xl border border-border/60 bg-card px-5 py-3 font-body text-muted-foreground text-sm italic leading-relaxed">
              Buzz is great for transcribing files. Echo is designed for the
              "speak and it types for you" workflow.
            </p>
            <Button asChild size="lg">
              <Link hash="download" to="/">
                Download Echo Free
              </Link>
            </Button>
          </motion.div>
        </section>

        {/* Quick wins bar */}
        <section className="border-border border-y bg-card/40 py-5">
          <div className="mx-auto max-w-5xl px-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-body font-semibold text-muted-foreground text-sm">
                Echo wins on:
              </span>
              {[
                "✓ Auto-Paste Dictation",
                "✓ Voice Activity Detection",
                "✓ LLM Post-Processing",
                "✓ Simpler UX",
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

        {/* Why Echo */}
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <motion.h2
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 font-bold font-display text-2xl text-foreground tracking-tight md:text-3xl"
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.5 }}
          >
            Why Echo for daily voice dictation
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
              Ready to switch?
            </h2>
            <p className="max-w-sm font-body text-muted-foreground text-sm">
              No account. No cloud. Free forever.
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
