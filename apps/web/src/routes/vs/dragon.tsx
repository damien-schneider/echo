"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/dragon")({
  component: DragonPage,
  head: () => ({
    meta: [
      {
        title:
          "Echo vs Dragon Dictate — Free Open-Source Alternative to Dragon",
      },
      {
        content:
          "Dragon Dictate costs $699 and only works on Windows. Echo is free, works on macOS, Windows, and Linux, and uses modern AI that matches Dragon's accuracy.",
        name: "description",
      },
      {
        content:
          "Echo vs Dragon Dictate — Free Open-Source Alternative to Dragon",
        property: "og:title",
      },
      {
        content:
          "Dragon Dictate costs $699 and only works on Windows. Echo is free, works on macOS, Windows, and Linux, and uses modern AI that matches Dragon's accuracy.",
        property: "og:description",
      },
    ],
  }),
});

const COMPARISON_ROWS = [
  {
    competitor: "$699 (Professional) · $799 (Legal)",
    echo: "Free forever",
    echoPositive: true,
    feature: "Price",
  },
  {
    competitor: "Windows only (Mac support discontinued 2018)",
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
    competitor: "License activation required",
    echo: "Never required",
    echoPositive: true,
    feature: "Account / Activation",
  },
  {
    competitor: "Yes — local processing",
    echo: "100% local — always offline",
    echoPositive: false,
    feature: "Offline Processing",
  },
  {
    competitor: "Nuance proprietary model (30+ years)",
    echo: "OpenAI Whisper + Parakeet (modern AI)",
    echoPositive: true,
    feature: "Speech Model",
  },
  {
    competitor: "Incompatible — discontinued on macOS",
    echo: "Fully supported",
    echoPositive: true,
    feature: "Apple Silicon (M1/M2/M3)",
  },
  {
    competitor: "Yes — deep OS integration",
    echo: "Yes — push-to-talk, pastes anywhere",
    echoPositive: false,
    feature: "Global Shortcut / Auto-Paste",
  },
  {
    competitor: "Full computer control by voice",
    echo: "Dictation only",
    echoPositive: false,
    feature: "OS-Level Voice Control",
  },
  {
    competitor: "Specialized domain vocabulary",
    echo: "General + LLM post-processing",
    echoPositive: false,
    feature: "Legal / Medical Vocabulary",
  },
  {
    competitor: "Adapts to your voice over time",
    echo: "Whisper handles diverse accents well",
    echoPositive: false,
    feature: "Accent Adaptation",
  },
  {
    competitor: "Limited language selection",
    echo: "Yes — Whisper supports 100+",
    echoPositive: true,
    feature: "100+ Languages",
  },
];

const WIN_CARDS = [
  {
    description:
      "Dragon is 30+ years old and uses a proprietary acoustic model. Echo uses OpenAI Whisper — a transformer trained on 680,000 hours of audio from the internet. On most general dictation tasks, Whisper's accuracy matches or exceeds Dragon at zero cost.",
    icon: "◈",
    title: "Modern AI vs. Legacy Software",
  },
  {
    description:
      "Dragon dropped macOS support in 2018 and is incompatible with Apple Silicon entirely. If you use a Mac — especially any M1, M2, or M3 machine — Dragon is simply not an option. Echo runs natively on all platforms.",
    icon: "⊕",
    title: "Works on macOS and Linux",
  },
  {
    description:
      "Dragon Professional costs $699. Dragon Legal costs $799. Echo costs nothing, has no activation, no subscription, and no license key. The savings alone could buy a year of cloud storage, a new keyboard, or simply stay in your pocket.",
    icon: "∞",
    title: "$699 vs. Free",
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
                Dragon Dictate
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

function DragonPage() {
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
              Echo vs Dragon Dictate
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              The free, modern alternative{" "}
              <span className="font-display font-light text-muted-foreground italic">
                to Dragon NaturallySpeaking
              </span>
            </h1>
            <p className="mb-8 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              Dragon Dictate costs $699, only works on Windows, and hasn't
              supported macOS since 2018. Echo is free, runs on macOS, Windows,
              and Linux, and uses OpenAI Whisper — modern AI that matches or
              exceeds Dragon's accuracy for everyday dictation.
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
                "✓ macOS + Linux",
                "✓ Modern AI",
                "✓ Open Source",
                "✓ No Activation",
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
            Why choose Echo over Dragon
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
