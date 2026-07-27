"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import EchoLogo from "@/components/icons/echo-logo";

const SCENES = [
  {
    id: "notes",
    lines: [
      { text: "Q4 Planning Session", type: "heading" as const },
      { text: "Maya Chen, Josh Rivera, Li Wei Zhang", type: "meta" as const },
      { text: "", type: "blank" as const },
      {
        text: "The backend migration finished ahead of schedule.",
        type: "text" as const,
      },
      {
        text: "Design team flagged two accessibility issues in the nav.",
        type: "text" as const,
      },
      { text: "", type: "blank" as const },
    ],
    notchText: "We agreed to push the launch to March fifteenth...",
    tab: "Taking notes",
    titleBar: "Meeting Notes — Notion",
    transcribed:
      "We agreed to push the launch to March fifteenth to give the design team two extra weeks for the accessibility audit.",
  },
  {
    id: "email",
    lines: [
      { text: "From: sarah.chen@acme.co", type: "meta" as const },
      {
        text: "Subject: Re: Project timeline update",
        type: "meta" as const,
      },
      { text: "", type: "blank" as const },
      {
        text: "Hi — checking if we're still on track for the Feb deadline?",
        type: "text" as const,
      },
      { text: "", type: "divider" as const },
      { text: "Reply:", type: "meta" as const },
    ],
    notchText: "Hi Sarah, yes we're on track...",
    tab: "Composing email",
    titleBar: "Re: Project timeline — Mail",
    transcribed:
      "Hi Sarah, yes we're on track. The backend wrapped yesterday and frontend should be done by Thursday. I'll send the staging link once deployed.",
  },
  {
    id: "code",
    lines: [
      {
        text: "export async function validateToken(token: string) {",
        type: "code" as const,
      },
      {
        text: "  const decoded = jwt.verify(token, SECRET);",
        type: "code" as const,
      },
      {
        text: "  const user = await db.users.findById(decoded.sub);",
        type: "code" as const,
      },
      { text: "", type: "blank" as const },
      { text: "  if (!user || user.deletedAt) {", type: "code" as const },
      {
        text: "    throw new AuthError('Invalid token');",
        type: "code" as const,
      },
      { text: "  }", type: "code" as const },
      { text: "", type: "blank" as const },
      { text: "  // ", type: "comment-prefix" as const },
    ],
    notchText: "Check if the user's session has been revoked...",
    tab: "Code comments",
    titleBar: "auth-middleware.ts — VS Code",
    transcribed:
      "Check if the user's session has been revoked in Redis before allowing the request through",
  },
];

function SceneNotch({ text }: { text: string }) {
  const BAR_DELAYS = [0, 120, 240, 360];

  return (
    <div className="absolute top-0 left-1/2 z-20 -translate-x-1/2">
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex flex-col overflow-hidden rounded-b-2xl bg-black shadow-lg"
        initial={{ opacity: 0, scale: 0.9, y: -8 }}
        style={{ width: 240 }}
        transition={{ delay: 0.3, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <div className="flex items-center justify-between px-3 pt-1.5 pb-1">
          <EchoLogo className="h-3 w-3 text-white/60" variant="sm" />
          <div className="flex h-3.5 items-center gap-[2px]">
            {BAR_DELAYS.map((d) => (
              <div
                className="w-[2px] rounded-full bg-white"
                key={`nb-${d}`}
                style={{
                  animation: `scene-notch-pulse 1.2s ease-in-out infinite ${d}ms`,
                  height: `${25 + d * 0.05}%`,
                  opacity: 0.5,
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="overflow-hidden whitespace-nowrap px-3 pb-1.5 font-medium text-[10px] text-white/70"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 8px, black calc(100% - 8px), transparent)",
          }}
        >
          {text}
        </div>
      </motion.div>
    </div>
  );
}

function DesktopScene({ scene }: { scene: (typeof SCENES)[number] }) {
  const [charCount, setCharCount] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    setCharCount(0);
    setTyping(false);
    const start = setTimeout(() => setTyping(true), 500);
    return () => clearTimeout(start);
  }, []);

  useEffect(() => {
    if (!typing || charCount >= scene.transcribed.length) {
      return;
    }
    const t = setTimeout(
      () => setCharCount((c) => c + 1),
      16 + Math.random() * 14
    );
    return () => clearTimeout(t);
  }, [typing, charCount, scene.transcribed.length]);

  const isCodeScene = scene.id === "code";
  const visibleText = scene.transcribed.slice(0, charCount);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="relative mx-auto w-full max-w-2xl"
      exit={{ opacity: 0, y: -16 }}
      initial={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl shadow-black/10 dark:shadow-black/40">
        {/* Title bar */}
        <div className="flex h-10 items-center border-border/40 border-b px-4">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]/60" />
          </div>
          <div className="flex-1 text-center">
            <span className="text-[10px] text-muted-foreground">
              {scene.titleBar}
            </span>
          </div>
        </div>

        {/* Content */}
        <div
          className={`p-5 ${isCodeScene ? "font-mono" : ""} text-sm leading-relaxed`}
          style={{ minHeight: 220 }}
        >
          {scene.lines.map((line, i) => {
            const key = `ln-${scene.id}-${i}`;
            if (line.type === "blank") {
              return <div className="h-4" key={key} />;
            }
            if (line.type === "divider") {
              return <div className="my-3 h-px bg-border/50" key={key} />;
            }
            if (line.type === "heading") {
              return (
                <p
                  className="mb-2 font-bold font-display text-base text-foreground tracking-tight"
                  key={key}
                >
                  {line.text}
                </p>
              );
            }
            if (line.type === "meta") {
              return (
                <p className="text-muted-foreground text-xs" key={key}>
                  {line.text}
                </p>
              );
            }
            if (line.type === "code") {
              return (
                <p className="text-foreground/70 text-xs" key={key}>
                  {line.text}
                </p>
              );
            }
            if (line.type === "comment-prefix") {
              return (
                <p className="text-xs" key={key}>
                  <span className="text-foreground/40">{line.text}</span>
                  {typing && (
                    <span className="text-foreground/40">{visibleText}</span>
                  )}
                  <Cursor />
                </p>
              );
            }
            return (
              <p className="text-foreground/80" key={key}>
                {line.text}
              </p>
            );
          })}

          {/* Transcribed text for non-code scenes */}
          {!isCodeScene && (
            <p className="text-foreground">
              {typing && visibleText}
              <Cursor />
            </p>
          )}
        </div>
      </div>

      <SceneNotch text={scene.notchText} />
    </motion.div>
  );
}

function Cursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      className="ml-0.5 inline-block h-3.5 w-0.5 bg-foreground align-middle"
      transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
    />
  );
}

const notchCSS = `
@keyframes scene-notch-pulse {
  0%, 100% { height: 20%; opacity: 0.3; }
  50% { height: 55%; opacity: 0.6; }
}`;

export default function VoiceDemo() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { margin: "-80px", once: true });

  return (
    <section className="bg-background py-24 md:py-36" ref={ref}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: local CSS keyframes */}
      <style dangerouslySetInnerHTML={{ __html: notchCSS }} />

      <div className="container mx-auto px-4">
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          className="mb-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="font-bold font-display text-[clamp(1.8rem,4vw,3.2rem)] leading-tight tracking-[-0.03em]">
            Voice to text,{" "}
            <span className="font-display font-light text-muted-foreground italic">
              anywhere you type
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-sm">
            Echo works system-wide. Trigger it from any app, and your words
            appear right where your cursor is.
          </p>
        </motion.div>

        {/* Tabs */}
        <motion.div
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          className="mb-10 flex justify-center"
          initial={{ opacity: 0, y: 12 }}
          transition={{ delay: 0.15, duration: 0.6, ease: "easeOut" }}
        >
          <div className="inline-flex gap-1 rounded-full border border-border/60 bg-secondary/50 p-1">
            {SCENES.map((s, i) => (
              <button
                className={`relative cursor-pointer rounded-full px-5 py-2 text-sm transition-colors duration-200 ${
                  i === active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/70"
                }`}
                key={s.id}
                onClick={() => setActive(i)}
                type="button"
              >
                {i === active && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-background shadow-sm"
                    layoutId="demo-tab"
                    transition={{
                      damping: 30,
                      stiffness: 400,
                      type: "spring",
                    }}
                  />
                )}
                <span className="relative z-10">{s.tab}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Desktop scene */}
        <motion.div
          animate={
            isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }
          }
          initial={{ opacity: 0, scale: 0.96 }}
          transition={{ delay: 0.25, duration: 0.8, ease: "easeOut" }}
        >
          <AnimatePresence mode="wait">
            <DesktopScene key={SCENES[active].id} scene={SCENES[active]} />
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
