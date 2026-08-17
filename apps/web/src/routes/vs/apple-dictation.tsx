"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/apple-dictation")({
  component: AppleDictationPage,
  head: () => ({
    meta: [
      {
        title:
          "Echo vs Apple Dictation — Open-Source Alternative with More Control",
      },
      {
        content:
          "Echo beats Apple Dictation with Whisper accuracy, cross-platform support, file transcription, LLM refinement, and full open-source transparency. Free on Mac, Windows, Linux.",
        name: "description",
      },
      {
        content:
          "Echo vs Apple Dictation — Open-Source Alternative with More Control",
        property: "og:title",
      },
      {
        content:
          "Echo beats Apple Dictation with Whisper accuracy, cross-platform support, file transcription, LLM refinement, and full open-source transparency. Free on Mac, Windows, Linux.",
        property: "og:description",
      },
    ],
  }),
});

const COMPARISON_ROWS = [
  {
    competitor: "Free (macOS only)",
    echo: "Free forever",
    echoPositive: false,
    feature: "Price",
  },
  {
    competitor: "macOS only",
    echo: "macOS, Windows, Linux",
    echoPositive: true,
    feature: "Platforms",
  },
  {
    competitor: "Older CMU Sphinx / limited Apple model",
    echo: "OpenAI Whisper (state-of-the-art)",
    echoPositive: true,
    feature: "Speech Model Quality",
  },
  {
    competitor: "Enhanced Dictation offline; standard uses Apple servers",
    echo: "100% local — always offline",
    echoPositive: true,
    feature: "Offline Processing",
  },
  {
    competitor: "Proprietary Apple software",
    echo: "MIT License — fully auditable",
    echoPositive: true,
    feature: "Open Source",
  },
  {
    competitor: "Live dictation only, no file support",
    echo: "Transcribe audio and video files",
    echoPositive: true,
    feature: "File Transcription",
  },
  {
    competitor: "Not available",
    echo: "Optional AI refinement",
    echoPositive: true,
    feature: "LLM Post-Processing",
  },
  {
    competitor: "No model choice",
    echo: "Whisper Small, Medium, or Large",
    echoPositive: true,
    feature: "Model Selection",
  },
  {
    competitor: "Limited Apple-supported languages",
    echo: "Whisper supports 100 languages",
    echoPositive: true,
    feature: "100 Language Support",
  },
  {
    competitor: "Tied to Apple ecosystem",
    echo: "Never required",
    echoPositive: true,
    feature: "Account / Apple ID",
  },
  {
    competitor: "System shortcut only (Fn key)",
    echo: "Custom shortcut, pastes anywhere",
    echoPositive: true,
    feature: "Global Shortcut / Auto-Paste",
  },
  {
    competitor: "Apple platform only",
    echo: "None — cross-platform, open standard",
    echoPositive: true,
    feature: "Ecosystem Lock-in",
  },
];

const WIN_CARDS = [
  {
    description:
      "Apple's Enhanced Dictation relies on an older CMU Sphinx-based model. Echo uses OpenAI Whisper — a modern transformer model trained on 680,000 hours of audio, with dramatically better accuracy across accents, domains, and languages.",
    icon: "◈",
    title: "Far Superior Accuracy",
  },
  {
    description:
      "Apple Dictation is macOS-only. Echo runs natively on macOS, Windows, and Linux. If you ever leave Apple's ecosystem, your workflow comes with you — no migration, no friction.",
    icon: "⊕",
    title: "Cross-Platform Freedom",
  },
  {
    description:
      "Apple Dictation only works live while you type. Echo can transcribe existing audio and video files, then optionally pass the result through a local LLM to clean up punctuation, remove filler words, and polish the output.",
    icon: "✦",
    title: "File Transcription & LLM Refinement",
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
                Apple Dictation
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

function AppleDictationPage() {
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
              Echo vs Apple Dictation
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              Open-source dictation{" "}
              <span className="font-display font-light text-muted-foreground italic">
                with more control
              </span>
            </h1>
            <p className="mb-8 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              Apple Dictation is convenient on macOS, but it's locked to the
              Apple ecosystem, uses an older speech model, and can't transcribe
              files. Echo brings state-of-the-art Whisper accuracy, cross-
              platform support, and open-source transparency — with no Apple ID
              required.
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
                "Accuracy",
                "Cross-Platform",
                "File Transcription",
                "Open Source",
                "100 Languages",
                "LLM Refinement",
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
            Why switch from Apple Dictation
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
              Ready to move beyond Apple Dictation?
            </h2>
            <p className="max-w-sm font-body text-muted-foreground text-sm">
              Better accuracy, more platforms, file transcription — and still
              100% offline and free.
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
