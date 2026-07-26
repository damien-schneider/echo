"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/handy")({
  component: HandyPage,
  head: () => ({
    meta: [
      {
        title: "Echo vs Handy — More Features, Same Privacy-First Philosophy",
      },
      {
        content:
          "Echo is built on top of Handy. Both are free, MIT-licensed, and 100% offline. Echo adds LLM tool-calling, redesigned UI, and polished onboarding on the same foundation.",
        name: "description",
      },
      {
        content: "Echo vs Handy — More Features, Same Privacy-First Philosophy",
        property: "og:title",
      },
      {
        content:
          "Echo is built on top of Handy. Both are free, MIT-licensed, and 100% offline. Echo adds LLM tool-calling, redesigned UI, and polished onboarding on the same foundation.",
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
    competitor: "MIT License (github.com/cjpais/Handy)",
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
    competitor: "100% local — always offline",
    echo: "100% local — always offline",
    echoPositive: false,
    feature: "Offline Processing",
  },
  {
    competitor: "Never",
    echo: "Never",
    echoPositive: false,
    feature: "Account Required",
  },
  {
    competitor: "Yes — push-to-talk, pastes anywhere",
    echo: "Yes — push-to-talk, pastes anywhere",
    echoPositive: false,
    feature: "Global Shortcut / Auto-Paste",
  },
  {
    competitor: "Yes",
    echo: "Yes",
    echoPositive: false,
    feature: "Voice Activity Detection",
  },
  {
    competitor: "Basic LLM support",
    echo: "Yes — extended AI capabilities",
    echoPositive: true,
    feature: "LLM Tool-Calling",
  },
  {
    competitor: "Minimal original design",
    echo: "Redesigned with motion animations",
    echoPositive: true,
    feature: "UI Design",
  },
  {
    competitor: "Basic",
    echo: "Polished in-app update flow",
    echoPositive: true,
    feature: "Update Checker",
  },
  {
    competitor: "Basic model selection",
    echo: "Enhanced model management UI",
    echoPositive: true,
    feature: "Model Management",
  },
  {
    competitor: "Minimal onboarding",
    echo: "Guided setup experience",
    echoPositive: true,
    feature: "Onboarding",
  },
  {
    competitor: "Yes",
    echo: "Not available",
    echoPositive: false,
    feature: "CLI Support",
  },
  {
    competitor: "Whisper + Parakeet + Breeze + SenseVoice",
    echo: "Whisper + Parakeet",
    echoPositive: false,
    feature: "ASR Models",
  },
];

const WIN_CARDS = [
  {
    description:
      "Echo would not exist without Handy. cjpais created the original architecture — Tauri-based, privacy-first, cross-platform dictation with global shortcuts and auto-paste. Echo extends that foundation rather than replacing it.",
    icon: "◎",
    title: "Built on the Same Foundation",
  },
  {
    description:
      "Echo adds LLM tool-calling support, a redesigned interface with motion animations, polished onboarding, and improved model management UI. If you want more on top of what Handy provides, Echo is the extended version.",
    icon: "✦",
    title: "Extended Feature Set",
  },
  {
    description:
      "Both apps share the same core values: 100% offline, MIT-licensed, no account, no cloud. Echo simply adds more interface polish and features for users who want a more complete experience.",
    icon: "⊕",
    title: "Same Privacy, More Polish",
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
                Handy
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
                      <span className="mr-1.5 text-muted-foreground">—</span>
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

function HandyPage() {
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
              Echo vs Handy
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              Echo extends Handy —{" "}
              <span className="font-display font-light text-muted-foreground italic">
                built on the same foundation
              </span>
            </h1>
            <p className="mb-4 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              This comparison is special. Echo is built on top of Handy, created
              by{" "}
              <a
                className="underline decoration-muted-foreground/50 hover:decoration-foreground"
                href="https://handy.computer"
                rel="noopener noreferrer"
                target="_blank"
              >
                cjpais
              </a>
              . Both are free, MIT-licensed, cross-platform, and 100% offline.
              Echo adds LLM tool-calling, a redesigned UI, and more polish on
              top of Handy's excellent foundation.
            </p>
            <p className="mb-8 max-w-2xl rounded-xl border border-brand/20 bg-brand/10 px-5 py-3 font-body text-foreground text-sm leading-relaxed">
              Echo would not exist without Handy. If you prefer the minimal
              original, Handy is excellent. If you want the extended feature
              set, try Echo.
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
                Echo adds:
              </span>
              {[
                "✓ LLM Tool-Calling",
                "✓ Animated UI",
                "✓ Polished Onboarding",
                "✓ Update Checker",
                "✓ Model Management UI",
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
            Echo and Handy: the relationship
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
              Want the extended feature set?
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
              </a>{" "}
              · Built on{" "}
              <a
                className="hover:underline"
                href="https://github.com/cjpais/Handy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Handy
              </a>
            </p>
          </motion.div>
        </section>
      </main>
      <EchoFooter />
    </div>
  );
}
