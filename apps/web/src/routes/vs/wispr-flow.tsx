"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/wispr-flow")({
  component: WisprFlowPage,
  head: () => ({
    meta: [
      {
        title: "Echo vs Wispr Flow — Private Offline Alternative to Wispr Flow",
      },
      {
        content:
          "Wispr Flow sends your audio to the cloud. Echo is a 100% offline, free, open-source alternative — your voice never leaves your device. No account required.",
        name: "description",
      },
      {
        content:
          "Echo vs Wispr Flow — Private Offline Alternative to Wispr Flow",
        property: "og:title",
      },
      {
        content:
          "Wispr Flow sends your audio to the cloud. Echo is a 100% offline, free, open-source alternative — your voice never leaves your device. No account required.",
        property: "og:description",
      },
    ],
  }),
});

const COMPARISON_ROWS = [
  {
    competitor: "Free (2,000 words/week) · $15/mo · $144/yr",
    echo: "Free forever",
    echoPositive: true,
    feature: "Price",
  },
  {
    competitor: "Cloud-based — audio sent to Wispr servers",
    echo: "100% local — nothing leaves your device",
    echoPositive: true,
    feature: "Audio Processing",
  },
  {
    competitor: "Proprietary closed source",
    echo: "MIT License — fully auditable",
    echoPositive: true,
    feature: "Open Source",
  },
  {
    competitor: "Mandatory signup",
    echo: "Never",
    echoPositive: true,
    feature: "Account Required",
  },
  {
    competitor: "macOS, Windows, iOS, Android",
    echo: "macOS, Windows, Linux",
    echoPositive: false,
    feature: "Platforms",
  },
  {
    competitor: "Yes — global shortcut auto-paste",
    echo: "Push-to-talk, pastes anywhere",
    echoPositive: false,
    feature: "Global Shortcut / Auto-Paste",
  },
  {
    competitor: "AI smart cleanup (removes um/uh)",
    echo: "Optional AI refinement",
    echoPositive: false,
    feature: "LLM Post-Processing",
  },
  {
    competitor: "Yes",
    echo: "Yes — Whisper supports 100+",
    echoPositive: false,
    feature: "100+ Languages",
  },
  {
    competitor: "2,000 words/week limit on free plan",
    echo: "Unlimited — no caps ever",
    echoPositive: true,
    feature: "Free Tier Limits",
  },
  {
    competitor: "Audio processed on Wispr servers",
    echo: "Your audio never touches a server",
    echoPositive: true,
    feature: "Data Sovereignty",
  },
  {
    competitor: "iOS and Android apps available",
    echo: "Desktop only",
    echoPositive: false,
    feature: "Mobile Apps",
  },
  {
    competitor: "Yes — edit text by voice commands",
    echo: "Not available",
    echoPositive: false,
    feature: "Command Mode (edit by voice)",
  },
];

const WIN_CARDS = [
  {
    description:
      "Wispr Flow has SOC 2 Type II certification, but that doesn't change a fundamental fact: your audio travels to their servers. Echo processes everything locally using Whisper. What you say never leaves your machine — not even encrypted.",
    icon: "🔒",
    title: "True Privacy — Zero Compromise",
  },
  {
    description:
      "Wispr Flow's free tier caps you at 2,000 words per week. Echo has no limits of any kind. Use it all day, every day, forever — without paying $15/month or worrying about word counts.",
    icon: "∞",
    title: "No Subscription, No Limits",
  },
  {
    description:
      "Wispr Flow raised $81M and is valued at $700M — meaning their business model depends on your data flowing through their infrastructure. Echo is MIT-licensed: the code is public and you can verify exactly how your audio is handled.",
    icon: "◎",
    title: "Fully Open Source",
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
                Wispr Flow
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

function WisprFlowPage() {
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
              Echo vs Wispr Flow
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              Private offline dictation,{" "}
              <span className="font-display font-light text-muted-foreground italic">
                without the cloud
              </span>
            </h1>
            <p className="mb-8 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              Wispr Flow's AI cleanup is impressive — but it requires your audio
              to travel to their servers every single time you speak. Echo runs
              entirely on your device using Whisper and Parakeet models. Free,
              open source, and truly private — your voice never leaves your
              machine.
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
                "✓ 100% Offline",
                "✓ Free Forever",
                "✓ Open Source",
                "✓ No Account",
                "✓ No Word Limits",
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
            Why choose Echo for private dictation
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
              Ready to switch to truly private dictation?
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
