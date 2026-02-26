"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useInView } from "motion/react";
import { useRef } from "react";
import EchoFooter from "@/components/landing/footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vs/")({
  head: () => ({
    meta: [
      {
        title: "Echo vs Alternatives — Free Offline Speech-to-Text Comparison",
      },
      {
        name: "description",
        content:
          "Compare Echo to Super Whisper, Wispr Flow, Dragon, MacWhisper, Buzz, Handy, VoiceInk, and Otter.ai. Free, private, open-source dictation for macOS, Windows, and Linux.",
      },
      {
        property: "og:title",
        content:
          "Echo vs Alternatives — Free Offline Speech-to-Text Comparison",
      },
      {
        property: "og:description",
        content:
          "Compare Echo to Super Whisper, Wispr Flow, Dragon, MacWhisper, Buzz, Handy, VoiceInk, and Otter.ai. Free, private, open-source dictation for macOS, Windows, and Linux.",
      },
    ],
  }),
  component: VsIndexPage,
});

type ComparisonSlug =
  | "/vs/wispr-flow"
  | "/vs/otter-ai"
  | "/vs/whisper-desktop"
  | "/vs/super-whisper"
  | "/vs/dragon"
  | "/vs/voiceink"
  | "/vs/handy"
  | "/vs/buzz"
  | "/vs/macwhisper"
  | "/vs/apple-dictation";

interface Comparison {
  badges: string[];
  competitor: string;
  description: string;
  headline: string;
  slug: ComparisonSlug;
}

interface ComparisonGroup {
  category: string;
  description: string;
  items: Comparison[];
  label: string;
}

const COMPARISON_GROUPS: ComparisonGroup[] = [
  {
    category: "cloud",
    label: "Cloud Alternatives",
    description: "For privacy-focused users who don't want audio in the cloud",
    items: [
      {
        slug: "/vs/wispr-flow",
        competitor: "Wispr Flow",
        headline: "Echo vs Wispr Flow",
        description:
          "Wispr Flow sends every word you say to their servers — despite SOC 2 certification. Echo processes everything locally. Same workflow, zero cloud.",
        badges: ["100% Offline", "Free vs $15/mo", "No Account"],
      },
      {
        slug: "/vs/otter-ai",
        competitor: "Otter.ai",
        headline: "Echo vs Otter.ai",
        description:
          "Otter.ai is for meeting transcription. Echo is for real-time dictation. Both are useful — but only Echo keeps your audio on your device.",
        badges: ["Real-Time Dictation", "Offline", "Free Forever"],
      },
      {
        slug: "/vs/whisper-desktop",
        competitor: "Whisper Desktop",
        headline: "Echo vs Whisper Desktop",
        description:
          "Both use Whisper models, but Echo adds global shortcuts, auto-paste, VAD, and LLM refinement — making it a real daily driver.",
        badges: ["Global Shortcuts", "Auto-Paste", "VAD", "LLM Refinement"],
      },
    ],
  },
  {
    category: "paid",
    label: "Paid Apps",
    description: "For budget-conscious users looking for free alternatives",
    items: [
      {
        slug: "/vs/super-whisper",
        competitor: "Super Whisper",
        headline: "Echo vs Super Whisper",
        description:
          "Super Whisper costs $249.99 for lifetime access to software that runs on your own hardware. Echo does the same core job for free.",
        badges: ["Free vs $249", "Windows + Linux", "Open Source"],
      },
      {
        slug: "/vs/dragon",
        competitor: "Dragon Dictate",
        headline: "Echo vs Dragon",
        description:
          "Dragon costs $699, dropped macOS support in 2018, and won't run on Apple Silicon. Echo is free, runs everywhere, and uses modern AI.",
        badges: ["Free vs $699", "macOS + Linux", "Modern AI"],
      },
      {
        slug: "/vs/voiceink",
        competitor: "VoiceInk",
        headline: "Echo vs VoiceInk",
        description:
          "VoiceInk is GPL-licensed and costs $25–$49. It requires macOS 14 Sonoma. Echo is MIT-licensed, free, and runs on all platforms.",
        badges: ["Free vs $49", "MIT License", "Cross-Platform"],
      },
    ],
  },
  {
    category: "foss",
    label: "Open Source Alternatives",
    description: "For the FOSS community comparing open-source options",
    items: [
      {
        slug: "/vs/handy",
        competitor: "Handy",
        headline: "Echo vs Handy",
        description:
          "Echo is built on top of Handy. Both are MIT-licensed, free, and cross-platform. Echo adds LLM tool-calling, animations, and more polish.",
        badges: ["Built on Handy", "LLM Tool-Calling", "Polished UI"],
      },
      {
        slug: "/vs/buzz",
        competitor: "Buzz",
        headline: "Echo vs Buzz",
        description:
          "Buzz is excellent for file transcription. Echo is optimized for the 'speak and it types for you' daily dictation workflow.",
        badges: ["Auto-Paste Dictation", "VAD", "LLM Refinement"],
      },
      {
        slug: "/vs/whisper-desktop",
        competitor: "Whisper Desktop",
        headline: "Echo vs Whisper Desktop",
        description:
          "Whisper Desktop is a basic GUI for Whisper. Echo adds the features needed to make it a daily driver for voice dictation.",
        badges: ["Global Shortcuts", "Auto-Paste", "Better UX"],
      },
    ],
  },
  {
    category: "platform",
    label: "Platform-Specific Tools",
    description: "For cross-platform users comparing platform-locked options",
    items: [
      {
        slug: "/vs/macwhisper",
        competitor: "MacWhisper",
        headline: "Echo vs MacWhisper",
        description:
          "MacWhisper transcribes existing audio files on macOS. Echo types for you in real time across macOS, Windows, and Linux.",
        badges: ["Live Dictation", "Windows + Linux", "Free"],
      },
      {
        slug: "/vs/apple-dictation",
        competitor: "Apple Dictation",
        headline: "Echo vs Apple Dictation",
        description:
          "Apple Dictation is macOS-only and uses older models. Echo brings Whisper accuracy and cross-platform support with no Apple ID.",
        badges: ["Cross-Platform", "Whisper Accuracy", "Open Source"],
      },
    ],
  },
];

const CATEGORY_CLASSES: Record<string, string> = {
  cloud: "bg-destructive/10 text-destructive border-destructive/25",
  paid: "bg-brand/10 text-foreground border-brand/25",
  foss: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/25",
  platform: "bg-muted text-muted-foreground border-border",
};

function ComparisonCard({ item }: { item: Comparison }) {
  return (
    <Link
      className="group flex h-full flex-col rounded-2xl border border-border/60 bg-card p-6 transition-all duration-200 hover:border-foreground/15 hover:shadow-sm"
      to={item.slug}
    >
      <h3 className="mb-2 font-bold font-display text-foreground text-lg leading-snug tracking-tight transition-colors group-hover:text-primary">
        {item.headline}
      </h3>

      <p className="mb-5 flex-1 font-body text-muted-foreground text-sm leading-relaxed">
        {item.description}
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {item.badges.map((badge) => (
          <span
            className="rounded-full border border-brand/25 bg-brand/10 px-2.5 py-0.5 font-body font-medium text-foreground text-xs"
            key={badge}
          >
            {badge}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between border-border/50 border-t pt-4">
        <span className="font-body font-medium text-primary text-xs transition-opacity group-hover:opacity-70">
          See comparison →
        </span>
      </div>
    </Link>
  );
}

function ComparisonGroups() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <div className="space-y-16" ref={ref}>
      {COMPARISON_GROUPS.map((group, groupIndex) => (
        <motion.div
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          initial={{ opacity: 0, y: 24 }}
          key={group.category}
          transition={{
            duration: 0.5,
            delay: 0.1 + groupIndex * 0.1,
            ease: "easeOut",
          }}
        >
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-3">
              <span
                className={`rounded-full border px-2.5 py-0.5 font-body font-medium text-xs ${CATEGORY_CLASSES[group.category] ?? "border-border bg-muted text-muted-foreground"}`}
              >
                {group.label}
              </span>
            </div>
            <p className="font-body text-muted-foreground text-sm">
              {group.description}
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((item) => (
              <ComparisonCard item={item} key={item.slug} />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function VsIndexPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const heroInView = useInView(heroRef, { once: true });

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <main className="pt-24">
        {/* Hero */}
        <div className="mx-auto max-w-5xl px-4 pt-12 pb-16">
          <motion.div
            animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            initial={{ opacity: 0, y: 24 }}
            ref={heroRef}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="mb-4 inline-block rounded-full border border-brand/30 bg-brand/10 px-3 py-1 font-body text-foreground text-sm">
              Comparisons
            </span>
            <h1 className="mb-4 font-bold font-display text-[clamp(2.25rem,5vw,3.5rem)] text-foreground leading-tight tracking-[-0.03em]">
              Echo vs{" "}
              <span className="font-display font-light text-muted-foreground italic">
                the alternatives
              </span>
            </h1>
            <p className="mb-8 max-w-xl font-body text-base text-muted-foreground">
              See how Echo compares to popular speech-to-text tools. Being free,
              offline, and open-source tends to win on privacy and price.
            </p>
            <Button asChild size="lg">
              <Link hash="download" to="/">
                Download Echo Free
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* Divider */}
        <div className="mx-auto max-w-5xl border-border border-t px-4" />

        {/* Grouped cards */}
        <div className="mx-auto max-w-5xl px-4 py-16">
          <ComparisonGroups />
        </div>

        {/* Summary CTA */}
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-5xl px-4 pb-24"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/60 bg-card px-8 py-12 text-center">
            <h2 className="font-bold font-display text-2xl text-foreground tracking-tight md:text-3xl">
              The verdict is simple
            </h2>
            <p className="max-w-md font-body text-muted-foreground text-sm">
              Echo is free, open-source, and runs 100% on your device. No
              account. No cloud. No tracking. No subscription. Just fast,
              accurate, private speech-to-text.
            </p>
            <Button asChild className="mt-2" size="lg">
              <Link hash="download" to="/">
                Download Echo — it's free
              </Link>
            </Button>
            <p className="font-body text-muted-foreground text-xs">
              MIT License ·{" "}
              <a
                className="hover:underline"
                href="https://github.com/damien-schneider/Echo"
                rel="noopener noreferrer"
                target="_blank"
              >
                View on GitHub
              </a>
            </p>
          </div>
        </motion.div>
      </main>
      <EchoFooter />
    </div>
  );
}
