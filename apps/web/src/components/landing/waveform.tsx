"use client";

import { type MotionValue, motion, useTime, useTransform } from "motion/react";

function WaveformBar({
  index,
  time,
}: {
  index: number;
  time: MotionValue<number>;
}) {
  const height = useTransform(time, (t) => {
    const tSec = t / 1000;

    // Symmetric envelope
    const dist = Math.abs(index - 19.5);
    const envelope = Math.max(0.15, 1 - (dist / 20) ** 2);

    // Coherent sine waves for "moving together" look
    const w1 = Math.sin(tSec * 3 + index * 0.2);
    const w2 = Math.sin(tSec * 4.7 + index * 0.15);

    // Combine
    const wave = (w1 + w2 * 0.5) / 1.5;

    // Map to 0-1 range
    const norm = (wave + 1) / 2;

    // Apply envelope and range
    const value = 10 + norm * 80 * envelope;

    return `${value}%`;
  });

  return (
    <motion.div
      className="w-2 rounded-full bg-primary opacity-80"
      style={{ height }}
    />
  );
}

const WAVEFORM_BAR_IDS = Array.from({ length: 40 }, (_, i) => `bar-${i}`);

export default function Waveform() {
  const time = useTime();

  return (
    <section className="overflow-hidden bg-background py-20 text-foreground">
      <div className="container mx-auto flex flex-col items-center gap-12 px-4">
        <div className="space-y-4 text-center">
          <h2 className="font-medium text-3xl lg:text-5xl">
            Instant Transcription
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Just press your shortcut and start speaking. Echo captures your
            voice instantly and transcribes it locally.
          </p>
        </div>

        <div className="relative flex h-64 w-full max-w-3xl items-center justify-center overflow-hidden rounded-xl border bg-secondary/30">
          {/* Fake UI Interface */}
          <div className="absolute top-4 left-4 flex gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500/50" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/50" />
            <div className="h-3 w-3 rounded-full bg-green-500/50" />
          </div>

          <div className="flex h-32 w-full items-center justify-center gap-1 px-20">
            {WAVEFORM_BAR_IDS.map((id, index) => (
              <WaveformBar index={index} key={id} time={time} />
            ))}
          </div>

          <div className="absolute bottom-6 rounded-lg border bg-background/80 px-4 py-2 font-mono text-sm shadow-sm backdrop-blur">
            <span className="text-muted-foreground">{">"}</span> Transcribing...
          </div>
        </div>
      </div>
    </section>
  );
}
