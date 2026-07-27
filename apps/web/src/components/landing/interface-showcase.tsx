"use client";

import {
  AudioLines,
  Box,
  Clock,
  Copy,
  History,
  Keyboard,
  Settings2,
  Sparkles,
  Speech,
} from "lucide-react";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import EchoLogo from "@/components/icons/echo-logo";

const sidebarItems = [
  { active: false, icon: Settings2, label: "App Settings" },
  { active: false, icon: AudioLines, label: "Transcription" },
  { active: false, icon: Sparkles, label: "Post Processing" },
  { active: false, icon: Speech, label: "Text-to-Speech" },
  { active: false, icon: Keyboard, label: "Keyboard" },
  { active: false, icon: Box, label: "Models" },
  { active: true, icon: History, label: "History" },
];

const historyEntries = [
  {
    duration: "8.3s",
    expanded: true,
    id: 1,
    text: "We agreed to push the launch to March fifteenth to give the design team two extra weeks for the accessibility audit.",
    time: "2 min ago",
    words: 24,
  },
  {
    duration: "5.1s",
    expanded: false,
    id: 2,
    text: "The backend migration finished ahead of schedule. We can start QA testing by Thursday.",
    time: "14 min ago",
    words: 15,
  },
  {
    duration: "4.7s",
    expanded: false,
    id: 3,
    text: "Check if the user's session has been revoked in Redis before allowing the request through.",
    time: "28 min ago",
    words: 16,
  },
  {
    duration: "3.9s",
    expanded: false,
    id: 4,
    text: "Hi Sarah, yes we're on track. The frontend should be done by Thursday.",
    time: "1 hr ago",
    words: 13,
  },
];

function FloatingNotch() {
  const BAR_DELAYS = [0, 150, 300, 450];
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="absolute top-0 left-1/2 z-20 -translate-x-1/2"
      initial={{ opacity: 0, scale: 0.8, y: -10 }}
      transition={{ delay: 1, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <div
        className="flex flex-col overflow-hidden rounded-b-3xl bg-black shadow-2xl shadow-black/40"
        style={{ width: 260 }}
      >
        <div className="flex shrink-0 items-center justify-between px-4 pt-2 pb-1.5">
          <EchoLogo className="h-3.5 w-3.5 text-white/70" variant="sm" />
          <div className="flex h-4 w-4 items-center justify-center gap-0.5">
            {BAR_DELAYS.map((d) => (
              <div
                className="w-[2.5px] rounded-full bg-white"
                key={`nb-${d}`}
                style={{
                  animation: `iface-pulse 1.2s ease-in-out infinite ${d}ms`,
                  height: `${25 + d * 0.05}%`,
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="overflow-hidden whitespace-nowrap px-4 pb-2 font-medium text-[11px] text-white/80"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 10px, black calc(100% - 10px), transparent)",
          }}
        >
          Schedule a follow-up with the design team next Tuesday...
        </div>
        <div className="absolute bottom-0 left-0 h-[1.5px] w-full overflow-hidden">
          <div
            className="h-full w-full"
            style={{
              animation: "iface-sweep 2.4s ease-in-out infinite",
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.5) 50%, transparent)",
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

const notchCSS = `
@keyframes iface-pulse {
  0%, 100% { height: 20%; opacity: 0.3; }
  50% { height: 55%; opacity: 0.6; }
}
@keyframes iface-sweep {
  0% { translate: -100% 0; }
  50% { translate: 100% 0; }
  100% { translate: -100% 0; }
}`;

function FakeAppWindow() {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/10 dark:shadow-black/40">
      {/* Title bar */}
      <div
        className="flex h-11 items-center border-border/40 border-b px-4"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.03), transparent)",
        }}
      >
        <div className="flex gap-2">
          <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <div className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-[11px] text-muted-foreground">Echo</span>
        </div>
      </div>

      <div className="flex" style={{ height: 380 }}>
        {/* Sidebar */}
        <div className="hidden w-44 shrink-0 flex-col border-border/40 border-r bg-foreground/[0.01] sm:flex">
          <div className="p-3 pb-1">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <EchoLogo className="h-5 w-5" variant="sm" />
              <span className="font-bold font-display text-foreground text-sm tracking-tight">
                Echo
              </span>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 px-2 pt-1">
            {sidebarItems.map((item) => (
              <div
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  item.active
                    ? "bg-foreground/[0.08] font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
                key={item.label}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </div>
            ))}
          </nav>
        </div>

        {/* Content: History view */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold font-display text-foreground text-sm tracking-tight">
                Transcription History
              </h3>
              <span className="text-[10px] text-muted-foreground">Today</span>
            </div>
            <div className="space-y-2">
              {historyEntries.map((entry) => (
                <div
                  className={`rounded-lg border p-3 transition-colors ${
                    entry.expanded
                      ? "border-brand/20 bg-brand/[0.03]"
                      : "border-border/40 bg-foreground/[0.01]"
                  }`}
                  key={entry.id}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {entry.time}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ·
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {entry.duration}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ·
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {entry.words} words
                      </span>
                    </div>
                    <Copy className="h-3 w-3 text-muted-foreground/50" />
                  </div>
                  <p
                    className={`text-xs leading-relaxed ${entry.expanded ? "text-foreground" : "truncate text-foreground/70"}`}
                  >
                    {entry.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InterfaceShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { margin: "-100px", once: true });

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: ref,
  });

  const appScale = useTransform(scrollYProgress, [0.1, 0.4], [0.92, 1]);
  const appRotateX = useTransform(scrollYProgress, [0.1, 0.4], [4, 0]);

  return (
    <section
      className="relative overflow-hidden bg-background py-24 md:py-36"
      ref={ref}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: local CSS keyframes */}
      <style dangerouslySetInnerHTML={{ __html: notchCSS }} />

      {/* Subtle warm wash */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/[0.03] blur-[100px]" />
      </div>

      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          className="mb-14 text-center"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-bold font-display text-[clamp(1.8rem,4vw,3.2rem)] leading-tight tracking-[-0.03em]">
            A native app that{" "}
            <span className="font-display font-light text-muted-foreground italic">
              disappears
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground text-sm">
            Configure shortcuts, pick your model, and review every
            transcription. Built with Rust and Tauri for a fast, minimal
            footprint.
          </p>
        </motion.div>

        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          className="relative mx-auto max-w-3xl"
          initial={{ opacity: 0, y: 40 }}
          style={{ perspective: 1200, rotateX: appRotateX, scale: appScale }}
          transition={{ delay: 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="absolute inset-0 scale-[0.97] transform rounded-3xl bg-brand/[0.04] blur-2xl dark:bg-brand/[0.06]" />
          <div className="relative">
            <FloatingNotch />
            <FakeAppWindow />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
