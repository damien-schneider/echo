"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/otter-ai")({
  component: OtterAiPage,
  head: () => ({
    meta: [
      {
        title:
          "Echo vs Otter.ai — Private Offline Dictation vs Meeting Transcription",
      },
      {
        content:
          "Otter.ai records meetings in the cloud. Echo transcribes your voice locally in real time with no account, no subscription, and no audio ever leaving your device.",
        name: "description",
      },
      {
        content:
          "Echo vs Otter.ai — Private Offline Dictation vs Meeting Transcription",
        property: "og:title",
      },
      {
        content:
          "Otter.ai records meetings in the cloud. Echo transcribes your voice locally in real time with no account, no subscription, and no audio ever leaving your device.",
        property: "og:description",
      },
    ],
  }),
});

const COMPARISON_ROWS = [
  {
    competitor: "Meeting transcription — joins Zoom/Teams/Meet calls",
    echo: "Real-time voice dictation — speak, it types in any app",
    echoPositive: false,
    feature: "Primary Use Case",
  },
  {
    competitor: "Free (300 min/month) · Pro $16.99/mo · Business $30/mo",
    echo: "Free forever",
    echoPositive: true,
    feature: "Price",
  },
  {
    competitor: "Cloud-based — audio sent to Otter servers",
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
    competitor: "Web, iOS, Android (no desktop app)",
    echo: "macOS, Windows, Linux desktop apps",
    echoPositive: true,
    feature: "Platforms",
  },
  {
    competitor: "No — meeting recording focus only",
    echo: "Yes — push-to-talk, pastes into any app",
    echoPositive: true,
    feature: "Global Shortcut / Auto-Paste",
  },
  {
    competitor: "Proprietary cloud model",
    echo: "Whisper Small, Medium, or Large (local)",
    echoPositive: true,
    feature: "Speech Model",
  },
  {
    competitor: "300 minutes/month, English/French/Spanish only",
    echo: "Unlimited — no caps ever",
    echoPositive: true,
    feature: "Free Tier Limits",
  },
  {
    competitor: "Yes — AI-generated summaries",
    echo: "Not yet (on roadmap)",
    echoPositive: false,
    feature: "Meeting Summaries / Action Items",
  },
  {
    competitor: "Yes — bot joins calls automatically",
    echo: "Not available",
    echoPositive: false,
    feature: "Zoom / Teams / Meet Integration",
  },
  {
    competitor: "Yes — identifies different speakers",
    echo: "Not yet",
    echoPositive: false,
    feature: "Multi-Speaker Diarization",
  },
  {
    competitor: "Audio stored on Otter servers",
    echo: "Nothing leaves your device",
    echoPositive: true,
    feature: "Data Retention",
  },
];

const WIN_CARDS = [
  {
    description:
      "Otter.ai is a meeting transcription tool — it joins your Zoom calls and generates summaries. Echo is a real-time dictation tool — you press a shortcut, speak, and it types in your email, document, or code editor. Most people searching for an 'Otter alternative' actually want the latter.",
    icon: "◈",
    title: "Different Tools for Different Jobs",
  },
  {
    description:
      "Every word you speak stays on your machine. Echo processes audio entirely offline using local Whisper models — no audio ever touches a server. Otter.ai sends your voice to their cloud every time you record, regardless of SOC 2 certification.",
    icon: "🔒",
    title: "Completely Private",
  },
  {
    description:
      "Otter's free plan caps you at 300 minutes per month and limits you to three languages. Echo has no limits of any kind — use it all day, every day, for as long as you want, in any of 100 languages.",
    icon: "∞",
    title: "Free Forever, No Limits",
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
                Otter.ai
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

function OtterAiPage() {
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
              Echo vs Otter.ai
            </span>
            <h1 className="mb-6 max-w-3xl font-bold font-display text-[clamp(2rem,4.5vw,3.25rem)] text-foreground leading-tight tracking-[-0.03em]">
              Private offline dictation,{" "}
              <span className="font-display font-light text-muted-foreground italic">
                not cloud meeting transcription
              </span>
            </h1>
            <p className="mb-4 max-w-2xl font-body text-base text-muted-foreground leading-relaxed">
              Otter.ai and Echo solve different problems. Otter.ai joins your
              Zoom calls and records meetings. Echo lets you speak and have it
              type in any app — email, documents, code editors — all processed
              locally on your device with no account and no subscription.
            </p>
            <p className="mb-8 max-w-2xl rounded-xl border border-border/60 bg-card px-5 py-3 font-body text-muted-foreground text-sm italic leading-relaxed">
              If you need to transcribe meetings, Otter.ai works well — but your
              audio goes to their cloud. Echo is building meeting transcription
              support in a future release, so you'll soon be able to keep your
              meetings private too.
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
                "✓ Real-Time Dictation",
                "✓ No Account",
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
            Why Echo for privacy-conscious users
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
              Ready to ditch the cloud?
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
