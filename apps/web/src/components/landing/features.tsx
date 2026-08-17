"use client";

import {
  Check,
  ChevronDown,
  FileAudio,
  Globe,
  Hand,
  Keyboard,
  Mic,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import EchoLogo from "@/components/icons/echo-logo";

function MiniNotch() {
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        className="flex w-48 items-center justify-between rounded-b-2xl bg-black px-4 py-2"
        transition={{ damping: 25, stiffness: 400, type: "spring" }}
        whileHover={{ scale: 1.02 }}
      >
        <EchoLogo className="h-3 w-3 text-white/70" variant="sm" />
        <div className="flex gap-0.5">
          {[0.4, 0.6, 0.3, 0.5].map((h, i) => (
            <motion.div
              animate={{ height: [`${h * 100}%`, `${h * 60}%`, `${h * 100}%`] }}
              className="w-[2px] rounded-full bg-white/50"
              key={`bar-${i.toString()}`}
              style={{ height: `${h * 100}%` }}
              transition={{
                duration: 1.5 + i * 0.2,
                ease: "easeInOut",
                repeat: Number.POSITIVE_INFINITY,
              }}
            />
          ))}
        </div>
      </motion.div>
      <motion.div
        animate={{ opacity: [0.7, 1, 0.7] }}
        className="flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1"
        transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
      >
        <Shield className="h-3 w-3 text-brand" />
        <span className="font-medium text-[9px] text-brand">
          Processing locally
        </span>
      </motion.div>
    </div>
  );
}

function MiniShortcutConfig() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-lg border border-foreground/5 bg-foreground/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <Keyboard className="h-3 w-3 text-muted-foreground" />
          <span className="text-foreground text-xs">Echo Shortcut</span>
        </div>
        <div className="flex items-center gap-1">
          <kbd className="rounded border border-foreground/10 bg-foreground/5 px-1.5 py-0.5 font-mono text-[9px] text-foreground">
            Ctrl
          </kbd>
          <kbd className="rounded border border-foreground/10 bg-foreground/5 px-1.5 py-0.5 font-mono text-[9px] text-foreground">
            Shift
          </kbd>
          <kbd className="rounded border border-foreground/10 bg-foreground/5 px-1.5 py-0.5 font-mono text-[9px] text-foreground">
            E
          </kbd>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-foreground/5 bg-foreground/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <Hand className="h-3 w-3 text-muted-foreground" />
          <span className="text-foreground text-xs">Push to Talk</span>
        </div>
        <div className="relative h-4 w-7 rounded-full bg-brand">
          <div className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full bg-background" />
        </div>
      </div>
    </div>
  );
}

function MiniVadWaveform() {
  const bars = [
    0.2, 0.15, 0.1, 0.08, 0.05, 0.05, 0.6, 0.8, 0.9, 0.7, 0.85, 0.75, 0.5, 0.3,
    0.05, 0.05, 0.08, 0.7, 0.9, 0.6,
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-12 w-full items-center justify-center gap-[2px]">
        {bars.map((h, i) => {
          const isVoice = h > 0.15;
          return (
            <motion.div
              animate={
                isVoice
                  ? { height: [`${h * 80}%`, `${h * 100}%`, `${h * 80}%`] }
                  : {}
              }
              className={`w-1 rounded-full ${isVoice ? "bg-foreground/60" : "bg-foreground/15"}`}
              key={`vad-${i.toString()}`}
              style={{ height: `${h * 100}%` }}
              transition={
                isVoice
                  ? {
                      duration: 0.8 + i * 0.05,
                      ease: "easeInOut",
                      repeat: Number.POSITIVE_INFINITY,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[9px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-foreground/15" />
          Silence filtered
        </span>
        <span className="flex items-center gap-1 text-foreground/70">
          <div className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
          Voice detected
        </span>
      </div>
    </div>
  );
}

function MiniFileDrop() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-lg border border-foreground/5 bg-foreground/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <FileAudio className="h-3.5 w-3.5 text-brand" />
          <div>
            <p className="font-medium text-[10px] text-foreground">
              interview.mp3
            </p>
            <p className="text-[8px] text-muted-foreground">24.3 MB</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5">
          <Check className="h-2.5 w-2.5 text-brand" />
          <span className="text-[8px] text-brand">Done</span>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-foreground/5 bg-foreground/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <FileAudio className="h-3.5 w-3.5 text-brand" />
          <div>
            <p className="font-medium text-[10px] text-foreground">
              meeting.wav
            </p>
            <p className="text-[8px] text-muted-foreground">156.7 MB</p>
          </div>
        </div>
        <div className="h-1 w-16 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full w-2/3 rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
}

function MiniLanguageSelector() {
  const langs = [
    { flag: "\u{1F1FA}\u{1F1F8}", name: "English" },
    { flag: "\u{1F1EB}\u{1F1F7}", name: "French" },
    { flag: "\u{1F1E9}\u{1F1EA}", name: "German" },
    { flag: "\u{1F1EF}\u{1F1F5}", name: "Japanese" },
    { flag: "\u{1F1EA}\u{1F1F8}", name: "Spanish" },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between rounded-lg border border-foreground/5 bg-foreground/[0.02] px-3 py-2">
        <div className="flex items-center gap-2">
          <Globe className="h-3 w-3 text-muted-foreground" />
          <span className="text-foreground text-xs">Language</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-foreground text-xs">Auto Detect</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {langs.map((l) => (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-foreground/5 bg-foreground/[0.02] px-2 py-1 text-[9px] text-foreground"
            key={l.name}
          >
            <span>{l.flag}</span>
            {l.name}
          </span>
        ))}
        <span className="inline-flex items-center rounded-md border border-foreground/5 bg-foreground/[0.02] px-2 py-1 text-[9px] text-muted-foreground">
          +95 more
        </span>
      </div>
    </div>
  );
}

function MiniPostProcessing() {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-foreground/5 bg-foreground/[0.02] p-3">
        <p className="mb-1.5 text-[9px] text-muted-foreground">Raw input</p>
        <p className="text-[10px] text-foreground/60 italic line-through">
          so basically the the team needs to uh finalize the the designs by
          friday
        </p>
      </div>
      <div className="flex items-center justify-center">
        <Sparkles className="h-3 w-3 text-brand" />
      </div>
      <div className="rounded-lg border border-brand/10 bg-brand/5 p-3">
        <p className="mb-1.5 text-[9px] text-brand">LLM post-processed</p>
        <p className="text-[10px] text-foreground">
          The team needs to finalize the designs by Friday.
        </p>
      </div>
    </div>
  );
}

function MiniToolCalls() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-foreground/5 bg-foreground/[0.02] px-3 py-2">
        <Wrench className="h-3 w-3 text-brand" />
        <span className="text-foreground text-xs">Tool Calling</span>
        <div className="relative ml-auto h-4 w-7 rounded-full bg-brand">
          <div className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full bg-background" />
        </div>
      </div>
      <div className="rounded-lg border border-foreground/5 bg-foreground/[0.02] p-3">
        <p className="mb-2 text-[9px] text-muted-foreground">
          Speak a command, Echo calls the tool
        </p>
        <div className="space-y-1.5 font-mono text-[9px]">
          <div className="flex items-center gap-1.5">
            <Mic className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-foreground/60 italic">
              "Send a message to Sarah saying I'll be late"
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wrench className="h-2.5 w-2.5 text-brand" />
            <span className="text-foreground">
              <span className="text-brand">send_message</span>(to: "Sarah",
              body: "I'll be late")
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCrossPlatform() {
  const platforms = [
    { name: "macOS", sub: "Intel & Apple Silicon" },
    { name: "Windows", sub: "x64" },
    { name: "Linux", sub: "AppImage & .deb" },
  ];

  return (
    <div className="flex gap-2">
      {platforms.map((p) => (
        <div
          className="flex flex-1 flex-col items-center gap-1 rounded-lg border border-foreground/5 bg-foreground/[0.02] p-2.5"
          key={p.name}
        >
          <span className="font-medium text-[10px] text-foreground">
            {p.name}
          </span>
          <span className="text-center text-[8px] text-muted-foreground">
            {p.sub}
          </span>
        </div>
      ))}
    </div>
  );
}

const features = [
  {
    className: "md:col-span-2 md:row-span-2",
    description:
      "All processing happens on your device. No audio or text ever leaves your machine.",
    hero: true,
    name: "100% Private",
    visual: MiniNotch,
  },
  {
    className: "md:col-span-1",
    description:
      "Configure hotkeys and push-to-talk to trigger transcription from any app.",
    name: "Global Shortcuts",
    visual: MiniShortcutConfig,
  },
  {
    className: "md:col-span-1",
    description:
      "Silero-based VAD filters silence, so you only transcribe speech.",
    name: "Voice Activity Detection",
    visual: MiniVadWaveform,
  },
  {
    className: "md:col-span-1",
    description:
      "Drag & drop audio or video files for batch transcription with progress tracking.",
    name: "File Transcription",
    visual: MiniFileDrop,
  },
  {
    className: "md:col-span-1",
    description: "Every model supports 100 languages with automatic detection.",
    name: "100 Languages",
    visual: MiniLanguageSelector,
  },
  {
    className: "md:col-span-2 md:row-span-2",
    description:
      "Clean up transcriptions with LLM-powered refinement. Fix grammar and filler words.",
    hero: true,
    name: "AI Post-Processing",
    visual: MiniPostProcessing,
  },
  {
    className: "md:col-span-1",
    description:
      "Speak natural commands and Echo routes them to tools via LLM function calling.",
    name: "LLM Tool Calling",
    visual: MiniToolCalls,
  },
  {
    className: "md:col-span-1",
    description:
      "Native apps for macOS, Windows, and Linux. Built with Rust and Tauri.",
    name: "Cross Platform",
    visual: MiniCrossPlatform,
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(cardRef, { margin: "-60px", once: true });

  return (
    <motion.div
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-500 hover:border-foreground/15 hover:shadow-foreground/[0.02] hover:shadow-lg ${feature.className} ${feature.hero ? "p-8" : "p-6"}`}
      initial={{ opacity: 0, y: 30 }}
      ref={cardRef}
      transition={{
        delay: index * 0.08,
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -2 }}
    >
      {/* Hover gradient overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-foreground/[0.01] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className={`relative z-10 ${feature.hero ? "mb-6" : "mb-4"}`}>
        <h3
          className={`mb-1.5 font-display font-semibold tracking-tight ${feature.hero ? "text-base" : "text-sm"} text-foreground`}
        >
          {feature.name}
        </h3>
        <p
          className={`text-muted-foreground leading-relaxed ${feature.hero ? "text-sm" : "text-xs"}`}
        >
          {feature.description}
        </p>
      </div>

      <motion.div
        className="relative z-10"
        initial={{ opacity: 0.8 }}
        transition={{ duration: 0.3 }}
        whileHover={{ opacity: 1 }}
      >
        <feature.visual />
      </motion.div>
    </motion.div>
  );
}

export default function Features() {
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const headingInView = useInView(headingRef, { margin: "-80px", once: true });

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: containerRef,
  });

  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "8%"]);

  return (
    <section
      className="relative overflow-hidden bg-background py-24 text-foreground md:py-32"
      ref={containerRef}
    >
      {/* Subtle parallax background grain */}
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          y: bgY,
        }}
      />

      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          animate={headingInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 24 }}
          ref={headingRef}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h2 className="font-bold font-display text-[clamp(1.8rem,4vw,3.2rem)] leading-tight tracking-[-0.03em]">
            Your voice deserves better{" "}
            <span className="font-display font-light text-muted-foreground italic">
              than a server
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground text-sm">
            Every feature works offline, out of the box. No accounts, no cloud,
            no compromises.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-4">
          {features.map((feature, index) => (
            <FeatureCard feature={feature} index={index} key={feature.name} />
          ))}
        </div>
      </div>
    </section>
  );
}
