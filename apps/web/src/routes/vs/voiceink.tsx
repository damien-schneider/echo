"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/voiceink")({
  component: VoiceInkPage,
  head: () => ({
    meta: [
      {
        title: "Echo vs VoiceInk — Free Cross-Platform Alternative",
      },
      {
        content:
          "VoiceInk costs $25–$49 and is macOS-only. Echo is free, works on macOS, Windows, and Linux, and uses the MIT license — not GPL. 100% offline, no account required.",
        name: "description",
      },
      {
        content: "Echo vs VoiceInk — Free Cross-Platform Alternative",
        property: "og:title",
      },
      {
        content:
          "VoiceInk costs $25–$49 and is macOS-only. Echo is free, works on macOS, Windows, and Linux, and uses the MIT license — not GPL. 100% offline, no account required.",
        property: "og:description",
      },
    ],
  }),
});

const COMPARISON_ROWS = [
  {
    competitor: "$25 Solo · $39 Personal (2 devices) · $49 Extended",
    echo: "Free forever",
    echoPositive: true,
    feature: "Price",
  },
  {
    competitor: "macOS 14 (Sonoma) only",
    echo: "macOS, Windows, Linux",
    echoPositive: true,
    feature: "Platforms",
  },
  {
    competitor: "GPL v3.0 (source available, binary paid)",
    echo: "MIT License",
    echoPositive: true,
    feature: "Open Source",
  },
  {
    competitor: "License purchase required",
    echo: "Never",
    echoPositive: true,
    feature: "Account Required",
  },
  {
    competitor: "Yes — local Whisper models",
    echo: "100% local — always offline",
    echoPositive: false,
    feature: "Offline Processing",
  },
  {
    competitor: "Yes — global shortcut auto-paste",
    echo: "Yes — push-to-talk, pastes anywhere",
    echoPositive: false,
    feature: "Global Shortcut / Auto-Paste",
  },
  {
    competitor: "Yes — Power Mode with per-app prompts",
    echo: "Optional AI refinement",
    echoPositive: false,
    feature: "LLM Post-Processing",
  },
  {
    competitor: "Yes — 100 languages",
    echo: "Yes — Whisper supports 100",
    echoPositive: false,
    feature: "100 Languages",
  },
  {
    competitor: "Reads on-screen content for context",
    echo: "Not available",
    echoPositive: false,
    feature: "Context Awareness",
  },
  {
    competitor: "Power Mode detects app/URL",
    echo: "Not available",
    echoPositive: false,
    feature: "Per-App Configurations",
  },
  {
    competitor: "Yes — expand abbreviations by voice",
    echo: "Not available",
    echoPositive: false,
    feature: "Smart Replace Shortcuts",
  },
  {
    competitor: "macOS 14 Sonoma minimum",
    echo: "Broad macOS compatibility",
    echoPositive: true,
    feature: "macOS Version Required",
  },
];

const WIN_CARDS = [
  {
    description:
      "VoiceInk publishes its source code under GPL, but you must pay $25–$49 for the binary. Echo is MIT-licensed and completely free — download, compile, or contribute without any payment or license key.",
    icon: "∞",
    title: "Free vs. Paid Binary",
  },
  {
    description:
      "VoiceInk requires macOS 14 Sonoma — ruling out all Windows and Linux users, and any Mac running an older OS. Echo runs natively on macOS, Windows, and Linux with broad version support.",
    icon: "⊕",
    title: "Windows and Linux Support",
  },
  {
    description:
      "VoiceInk uses GPL v3.0, which imposes copyleft requirements on derivative works. Echo uses the MIT license — the most permissive open-source license, with no restrictions on how you use, modify, or build on it.",
    icon: "◎",
    title: "MIT vs. GPL License",
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
                VoiceInk
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

function VoiceInkPage() {
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
              Echo vs VoiceInk
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              Truly free, truly cross-platform,{" "}
              <span className="font-display font-light text-muted-foreground italic">
                no license required
              </span>
            </h1>
            <p className="mb-8 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              VoiceInk is an impressive offline dictation tool — but it costs up
              to $49, requires macOS 14 Sonoma, and uses a GPL license that
              restricts how you can build on it. Echo is completely free, works
              on macOS, Windows, and Linux, and is MIT-licensed with no
              restrictions whatsoever.
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
                "✓ Windows + Linux",
                "✓ MIT License",
                "✓ No License Key",
                "✓ Broad macOS Support",
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
            Why choose Echo over VoiceInk
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
