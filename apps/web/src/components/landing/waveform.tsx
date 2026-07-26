"use client";

import {
  type MotionValue,
  motion,
  useInView,
  useTime,
  useTransform,
} from "motion/react";
import { useRef } from "react";
import EchoLogo from "@/components/icons/echo-logo";

/* ── Animated waveform bar ─────────────────────────────────────────── */

function WaveformBar({
  index,
  time,
  total,
}: {
  index: number;
  time: MotionValue<number>;
  total: number;
}) {
  const height = useTransform(time, (t) => {
    const tSec = t / 1000;
    const center = (total - 1) / 2;
    const dist = Math.abs(index - center);
    const envelope = Math.max(0.15, 1 - (dist / (total / 2)) ** 2);
    const w1 = Math.sin(tSec * 3 + index * 0.2);
    const w2 = Math.sin(tSec * 4.7 + index * 0.15);
    const wave = (w1 + w2 * 0.5) / 1.5;
    const norm = (wave + 1) / 2;
    const value = 8 + norm * 80 * envelope;
    return `${value}%`;
  });

  return (
    <motion.div
      className="w-1.5 rounded-full bg-foreground opacity-70"
      style={{ height }}
    />
  );
}

/* ── Fake notch overlay (matches real overlay exactly) ─────────────── */

function FakeNotch({
  state,
  text,
}: {
  state: "recording" | "transcribing";
  text?: string;
}) {
  const hasText = state === "transcribing" && Boolean(text);
  const BAR_DELAYS = [0, 150, 300, 450];

  return (
    <div
      className="relative mx-auto flex flex-col overflow-hidden rounded-b-3xl bg-black text-white"
      style={{
        transformOrigin: "top center",
        width: 310,
      }}
    >
      {/* Top row: Logo + Bars */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-2.5 pb-2">
        <EchoLogo className="h-4 w-4 text-white/70" variant="sm" />
        <div className="flex h-5 w-5 items-center justify-center gap-0.5">
          {BAR_DELAYS.map((delay) => (
            <div
              className="w-[3px] rounded-full bg-white"
              key={delay}
              style={{
                animation:
                  state === "transcribing"
                    ? `notch-bar-pulse 1.2s ease-in-out infinite ${delay}ms`
                    : undefined,
                height: state === "recording" ? `${30 + delay * 0.1}%` : "20%",
                opacity: state === "recording" ? 0.7 : 0.3,
              }}
            />
          ))}
        </div>
      </div>

      {/* Text row */}
      {hasText && (
        <div
          className="overflow-hidden whitespace-nowrap px-5 pb-2.5 font-medium text-[13px] text-white/80"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)",
          }}
        >
          {text}
        </div>
      )}

      {/* Progress sweep line */}
      {state === "transcribing" && (
        <div className="absolute bottom-0 left-0 h-[1.5px] w-full overflow-hidden rounded-b-3xl">
          <div
            className="h-full w-full"
            style={{
              animation: "notch-progress-sweep 2.4s ease-in-out infinite",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
            }}
          />
        </div>
      )}

      {/* Breathing bg for transcribing */}
      {state === "transcribing" && (
        <div
          className="pointer-events-none absolute inset-0 rounded-b-3xl"
          style={{
            animation: "notch-breathing 2s ease-in-out infinite",
          }}
        />
      )}
    </div>
  );
}

/* ── Step card ─────────────────────────────────────────────────────── */

function Step({
  number,
  title,
  description,
  children,
  delay,
  isInView,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
  delay: number;
  isInView: boolean;
}) {
  return (
    <motion.div
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: 32 }}
      transition={{ delay, duration: 0.6, ease: "easeOut" }}
    >
      <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full border border-foreground/10 bg-foreground/5 font-medium font-mono text-foreground text-sm">
        {number}
      </div>
      <h3 className="mb-1 font-medium text-foreground text-lg">{title}</h3>
      <p className="mb-6 max-w-xs text-center text-muted-foreground text-sm">
        {description}
      </p>
      {children}
    </motion.div>
  );
}

/* ── Fake editor window ────────────────────────────────────────────── */

function FakeEditorWindow() {
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-lg">
      <div className="flex h-8 items-center border-foreground/5 border-b bg-foreground/[0.02] px-3">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-[10px] text-muted-foreground">
            notes.md — VS Code
          </span>
        </div>
      </div>
      <div className="p-4 font-mono text-xs leading-relaxed">
        <p className="text-muted-foreground">
          <span className="text-foreground/40">##</span> Meeting Notes
        </p>
        <p className="mt-2 text-muted-foreground">
          Today we discussed the new feature rollout...
        </p>
        <p className="mt-2 text-foreground">
          The design team will finalize the mockups by Friday and share them
          with engineering for review.
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            className="ml-0.5 inline-block h-4 w-0.5 bg-foreground align-middle"
            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
          />
        </p>
      </div>
    </div>
  );
}

/* ── CSS for notch animations (injected inline) ────────────────────── */

const notchStyles = `
@keyframes notch-bar-pulse {
  0%, 100% { height: 20%; opacity: 0.3; }
  50% { height: 55%; opacity: 0.6; }
}
@keyframes notch-progress-sweep {
  0% { translate: -100% 0; }
  50% { translate: 100% 0; }
  100% { translate: -100% 0; }
}
@keyframes notch-breathing {
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(20,20,20,0.5); }
}
`;

/* ── Main section ──────────────────────────────────────────────────── */

const WAVEFORM_BAR_IDS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);

export default function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { margin: "-100px", once: true });
  const time = useTime();

  return (
    <section
      className="overflow-hidden bg-background py-24 text-foreground md:py-32"
      ref={containerRef}
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: local CSS keyframes */}
      <style dangerouslySetInnerHTML={{ __html: notchStyles }} />

      <div className="container mx-auto px-4">
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h2 className="mb-4 font-display text-3xl tracking-tight lg:text-5xl">
            Three steps. Zero friction.
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Press a key, speak, and your words appear as text — right where you
            need them.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-3">
          {/* Step 1: Press Shortcut */}
          <Step
            delay={0.2}
            description="Trigger Echo from anywhere with a configurable global shortcut."
            isInView={isInView}
            number="1"
            title="Press Your Shortcut"
          >
            <div className="w-full max-w-sm overflow-hidden rounded-xl border border-foreground/10 bg-card p-6 shadow-lg">
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2">
                  <kbd className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-foreground/15 bg-foreground/5 px-3 font-mono text-foreground text-sm shadow-[0_2px_0_0_rgba(0,0,0,0.06)]">
                    Ctrl
                  </kbd>
                  <span className="text-muted-foreground text-xs">+</span>
                  <kbd className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-foreground/15 bg-foreground/5 px-3 font-mono text-foreground text-sm shadow-[0_2px_0_0_rgba(0,0,0,0.06)]">
                    Shift
                  </kbd>
                  <span className="text-muted-foreground text-xs">+</span>
                  <kbd className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-foreground/15 bg-foreground/5 px-3 font-mono text-foreground text-sm shadow-[0_2px_0_0_rgba(0,0,0,0.06)]">
                    E
                  </kbd>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/50" />
                  Works in any application
                </div>
              </div>
            </div>
          </Step>

          {/* Step 2: Speak — shows the notch overlay */}
          <Step
            delay={0.4}
            description="The Echo notch appears at the top of your screen with live audio feedback."
            isInView={isInView}
            number="2"
            title="Speak Naturally"
          >
            <div className="flex w-full max-w-sm flex-col items-center gap-4">
              {/* Notch overlay */}
              <FakeNotch state="recording" />

              {/* Waveform visualization below */}
              <div className="w-full overflow-hidden rounded-xl border border-foreground/10 bg-card shadow-lg">
                <div className="flex flex-col items-center gap-3 p-5">
                  <div className="flex h-16 w-full items-center justify-center gap-[3px]">
                    {WAVEFORM_BAR_IDS.map((id, index) => (
                      <WaveformBar
                        index={index}
                        key={id}
                        time={time}
                        total={WAVEFORM_BAR_IDS.length}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-foreground/60" />
                    <span className="font-medium text-[10px] text-foreground/60">
                      Recording
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Step>

          {/* Step 3: Text Appears — shows notch transcribing + result */}
          <Step
            delay={0.6}
            description="Echo transcribes locally and pastes text into your active field."
            isInView={isInView}
            number="3"
            title="Text Appears Instantly"
          >
            <div className="flex w-full max-w-sm flex-col items-center gap-4">
              {/* Notch in transcribing state */}
              <FakeNotch
                state="transcribing"
                text="The design team will finalize the mockups by Friday..."
              />

              {/* Editor window */}
              <FakeEditorWindow />
            </div>
          </Step>
        </div>
      </div>
    </section>
  );
}
