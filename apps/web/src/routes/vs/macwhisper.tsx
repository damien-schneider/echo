"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/macwhisper")({
  component: MacWhisperPage,
  head: () => ({
    meta: [
      {
        title: "Echo vs MacWhisper — Free Whisper App with Live Dictation",
      },
      {
        content:
          "MacWhisper transcribes files. Echo types for you in real time — global shortcut, auto-paste into any app, Windows and Linux support. Free forever, open source.",
        name: "description",
      },
      {
        content: "Echo vs MacWhisper — Free Whisper App with Live Dictation",
        property: "og:title",
      },
      {
        content:
          "MacWhisper transcribes files. Echo types for you in real time — global shortcut, auto-paste into any app, Windows and Linux support. Free forever, open source.",
        property: "og:description",
      },
    ],
  }),
});

const COMPARISON_ROWS = [
  {
    competitor: "Free basic · $79.99 lifetime Pro · $8.99/mo",
    echo: "Free forever",
    echoPositive: true,
    feature: "Price",
  },
  {
    competitor: "File transcription (existing audio/video files)",
    echo: "Real-time voice dictation (speak → types for you)",
    echoPositive: false,
    feature: "Primary Use Case",
  },
  {
    competitor: "macOS only",
    echo: "macOS, Windows, Linux",
    echoPositive: true,
    feature: "Platforms",
  },
  {
    competitor: "Proprietary closed source",
    echo: "MIT License — fully auditable",
    echoPositive: true,
    feature: "Open Source",
  },
  {
    competitor: "Not required",
    echo: "Never",
    echoPositive: false,
    feature: "Account Required",
  },
  {
    competitor: "No global dictation shortcut",
    echo: "Yes — speak, it types in any app",
    echoPositive: true,
    feature: "Global Shortcut / Auto-Paste",
  },
  {
    competitor: "Manual recording",
    echo: "Yes — auto-detects speech start/stop",
    echoPositive: true,
    feature: "Voice Activity Detection",
  },
  {
    competitor: "Not available",
    echo: "Optional AI refinement",
    echoPositive: true,
    feature: "LLM Post-Processing",
  },
  {
    competitor: "Yes — batch file processing",
    echo: "Supported",
    echoPositive: false,
    feature: "File Transcription",
  },
  {
    competitor: "Yes — SRT, VTT, docx, PDF",
    echo: "Not available",
    echoPositive: false,
    feature: "Export Formats (SRT/VTT/docx)",
  },
  {
    competitor: "Yes (Pro)",
    echo: "Not yet",
    echoPositive: false,
    feature: "Speaker Diarization",
  },
  {
    competitor: "Yes — 100 languages",
    echo: "Yes — Whisper supports 100",
    echoPositive: false,
    feature: "100 Languages",
  },
];

const WIN_CARDS = [
  {
    description:
      "MacWhisper excels at converting existing audio files into text. Echo is built for the opposite workflow: you press a shortcut, speak, and it types directly into whatever app is in front of you — email, code editor, document, chat.",
    icon: "◈",
    title: "Built for Dictation, Not Transcription",
  },
  {
    description:
      "MacWhisper is macOS-only and costs up to $79.99 for Pro. Echo is free forever and runs on macOS, Windows, and Linux. If you use more than one operating system, Echo is the only choice.",
    icon: "⊕",
    title: "Cross-Platform and Free",
  },
  {
    description:
      "MacWhisper is closed source. Echo is MIT-licensed — every line of code is publicly auditable. You can see exactly how your audio is handled, contribute improvements, or fork the project entirely.",
    icon: "◎",
    title: "Open Source Transparency",
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
                MacWhisper
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
                      <span className="mr-1.5">—</span>
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

function MacWhisperPage() {
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
              Echo vs MacWhisper
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              Real-time dictation,{" "}
              <span className="font-display font-light text-muted-foreground italic">
                not just file transcription
              </span>
            </h1>
            <p className="mb-4 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              MacWhisper is excellent at transcribing audio and video files —
              4.7 stars and 1,500+ App Store reviews prove it. But if you want
              to speak and have it type in your email, code editor, or document,
              that's a different tool. That's Echo.
            </p>
            <p className="mb-8 max-w-2xl rounded-xl border border-border/60 bg-card px-5 py-3 font-body text-muted-foreground text-sm italic leading-relaxed">
              If you need to transcribe recordings, MacWhisper is excellent. If
              you want to type with your voice in real time, use Echo.
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
                "✓ Free Forever",
                "✓ Live Dictation",
                "✓ Auto-Paste",
                "✓ Windows + Linux",
                "✓ Open Source",
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
