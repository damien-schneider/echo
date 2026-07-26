"use client";

import { motion, useInView, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

/* ── Data flow node ────────────────────────────────────────────────── */

function FlowNode({
  label,
  sublabel,
  delay,
  isInView,
  glow,
  muted,
}: {
  label: string;
  sublabel: string;
  delay: number;
  isInView: boolean;
  glow?: string;
  muted?: boolean;
}) {
  return (
    <motion.div
      animate={
        isInView ? { opacity: muted ? 0.3 : 1, y: 0 } : { opacity: 0, y: 20 }
      }
      className="flex flex-col items-center"
      initial={{ opacity: 0, y: 20 }}
      transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-2xl border md:h-24 md:w-24 ${
          muted
            ? "border-white/5 bg-white/[0.02]"
            : "border-white/10 bg-white/[0.04]"
        }`}
        style={glow ? { boxShadow: `0 0 40px ${glow}` } : undefined}
      >
        <span className="text-2xl">{label}</span>
      </div>
      <span className="mt-3 text-center text-[10px] text-white/30 uppercase tracking-[0.15em]">
        {sublabel}
      </span>
    </motion.div>
  );
}

/* ── Connecting arrow ──────────────────────────────────────────────── */

function FlowArrow({ delay, isInView }: { delay: number; isInView: boolean }) {
  return (
    <motion.div
      animate={isInView ? { opacity: 1, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
      className="hidden items-center md:flex"
      initial={{ opacity: 0, scaleX: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="h-px w-10 bg-gradient-to-r from-white/20 to-white/8 lg:w-16" />
      <div className="h-0 w-0 border-y-[3px] border-y-transparent border-l-[5px] border-l-white/15" />
    </motion.div>
  );
}

/* ── Blocked arrow (to cloud) ──────────────────────────────────────── */

function BlockedArrow({
  delay,
  isInView,
}: {
  delay: number;
  isInView: boolean;
}) {
  return (
    <motion.div
      animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
      className="hidden flex-col items-center gap-1.5 md:flex"
      initial={{ opacity: 0, scale: 0.8 }}
      transition={{ delay, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <div className="flex items-center">
        <div className="h-px w-8 bg-white/20 lg:w-12" />
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5">
          <span className="font-bold text-[10px] text-white/50">✕</span>
        </div>
        <div className="h-px w-8 bg-white/20 lg:w-12" />
      </div>
      <span className="text-[8px] text-white/30 uppercase tracking-[0.2em]">
        Blocked
      </span>
    </motion.div>
  );
}

/* ── Mobile flow (vertical) ────────────────────────────────────────── */

function MobileFlowArrow({
  delay,
  isInView,
}: {
  delay: number;
  isInView: boolean;
}) {
  return (
    <motion.div
      animate={isInView ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0 }}
      className="flex flex-col items-center md:hidden"
      initial={{ opacity: 0, scaleY: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
    >
      <div className="h-6 w-px bg-gradient-to-b from-white/20 to-white/8" />
      <div className="h-0 w-0 border-x-[3px] border-x-transparent border-t-[5px] border-t-white/15" />
    </motion.div>
  );
}

/* ── Main section ──────────────────────────────────────────────────── */

export default function PrivacyManifesto() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { margin: "-80px", once: true });

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: ref,
  });

  const glowScale = useTransform(scrollYProgress, [0.1, 0.5], [0.8, 1.2]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.3], [0, 1]);

  return (
    <section
      className="relative overflow-hidden bg-black py-32 text-white md:py-44"
      ref={ref}
    >
      {/* Ambient glow */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ opacity: glowOpacity }}
      >
        <motion.div
          className="absolute top-1/2 left-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(200,150,100,0.04) 0%, transparent 70%)",
            scale: glowScale,
          }}
        />
      </motion.div>

      {/* Grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
        }}
      />

      <div className="container relative z-10 mx-auto px-4">
        {/* Giant headline — THE SCREENSHOT MOMENT */}
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          className="mb-20 text-center md:mb-28"
          initial={{ opacity: 0, y: 30 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="mx-auto max-w-4xl font-bold font-display text-[clamp(2rem,5.5vw,4.5rem)] leading-[1.05] tracking-[-0.03em]">
            Your voice never leaves{" "}
            <span className="font-display font-light text-white/40 italic">
              this machine.
            </span>
          </h2>
          <p className="mx-auto mt-6 max-w-md text-sm text-white/30">
            Zero bytes sent to any server. Zero accounts required. Zero
            telemetry. Everything happens on your hardware, in your RAM, under
            your control.
          </p>
        </motion.div>

        {/* Data flow diagram — Desktop (horizontal) */}
        <div className="mx-auto hidden max-w-3xl items-center justify-center md:flex">
          <FlowNode
            delay={0.3}
            glow="rgba(200,150,100,0.08)"
            isInView={isInView}
            label="🎙"
            sublabel="Your mic"
          />
          <FlowArrow delay={0.45} isInView={isInView} />
          <FlowNode
            delay={0.55}
            glow="rgba(200,150,100,0.12)"
            isInView={isInView}
            label="🧠"
            sublabel="Local AI"
          />
          <FlowArrow delay={0.7} isInView={isInView} />
          <FlowNode
            delay={0.8}
            isInView={isInView}
            label="Aa"
            sublabel="Your text"
          />
          <BlockedArrow delay={1} isInView={isInView} />
          <FlowNode
            delay={1.1}
            isInView={isInView}
            label="☁️"
            muted
            sublabel="Cloud"
          />
        </div>

        {/* Data flow — Mobile (vertical) */}
        <div className="mx-auto flex flex-col items-center md:hidden">
          <FlowNode
            delay={0.3}
            glow="rgba(200,150,100,0.08)"
            isInView={isInView}
            label="🎙"
            sublabel="Your mic"
          />
          <MobileFlowArrow delay={0.4} isInView={isInView} />
          <FlowNode
            delay={0.5}
            glow="rgba(200,150,100,0.12)"
            isInView={isInView}
            label="🧠"
            sublabel="Local AI"
          />
          <MobileFlowArrow delay={0.6} isInView={isInView} />
          <FlowNode
            delay={0.7}
            isInView={isInView}
            label="Aa"
            sublabel="Your text"
          />
        </div>

        {/* Stats */}
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          className="mx-auto mt-20 flex max-w-lg justify-center gap-12 md:mt-28"
          initial={{ opacity: 0, y: 14 }}
          transition={{ delay: 1.3, duration: 0.8, ease: "easeOut" }}
        >
          <div className="text-center">
            <div className="font-bold font-display text-3xl tracking-tight md:text-4xl">
              0
            </div>
            <div className="mt-1 text-[10px] text-white/25 uppercase tracking-[0.15em]">
              bytes uploaded
            </div>
          </div>
          <div className="text-center">
            <div className="font-bold font-display text-3xl tracking-tight md:text-4xl">
              0
            </div>
            <div className="mt-1 text-[10px] text-white/25 uppercase tracking-[0.15em]">
              accounts needed
            </div>
          </div>
          <div className="text-center">
            <div className="font-bold font-display text-3xl tracking-tight md:text-4xl">
              MIT
            </div>
            <div className="mt-1 text-[10px] text-white/25 uppercase tracking-[0.15em]">
              licensed
            </div>
          </div>
        </motion.div>

        {/* CTA #2 */}
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          className="mt-14 text-center"
          initial={{ opacity: 0, y: 10 }}
          transition={{ delay: 1.6, duration: 0.6, ease: "easeOut" }}
        >
          <a
            className="inline-block rounded-full border border-white/10 px-7 py-3 text-sm text-white/60 transition-all duration-300 hover:border-white/20 hover:text-white active:scale-[0.98]"
            href="#download"
          >
            Keep your voice private
          </a>
        </motion.div>
      </div>
    </section>
  );
}
