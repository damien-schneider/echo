import { Spinner } from "@/components/ui/spinner";
import type { BatchPhase, MeetingBatchProgress } from "@/lib/types";

interface MeetingBatchProgressViewProps {
  progress: Record<string, MeetingBatchProgress | null>;
}

const phaseLabel = (phase: BatchPhase, source: string): string => {
  const sourceLabel = source === "system" ? "system audio" : "microphone";
  switch (phase) {
    case "diarizing":
      return `Identifying speakers (${sourceLabel})…`;
    case "transcribing":
      return `Transcribing ${sourceLabel}`;
    case "done":
      return `Done (${sourceLabel})`;
    default:
      return sourceLabel;
  }
};

export const MeetingBatchProgressView = ({
  progress,
}: MeetingBatchProgressViewProps) => {
  const sources = Object.values(progress).filter(
    (p): p is MeetingBatchProgress => p !== null
  );
  if (sources.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
        <Spinner />
        <span>Saving meeting and preparing transcription…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/40 bg-muted/40 p-3">
      {sources.map((p) => {
        const ratio = p.chunks_total === 0 ? 0 : p.chunks_done / p.chunks_total;
        const pct = Math.min(100, Math.round(ratio * 100));
        const isDone = p.phase === "done";
        return (
          <div className="flex flex-col gap-1" key={`${p.source}-${p.phase}`}>
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span className="flex items-center gap-2">
                {!isDone && <Spinner className="size-3" />}
                {phaseLabel(p.phase, p.source)}
              </span>
              {p.chunks_total > 0 && p.phase !== "diarizing" && (
                <span className="font-mono">
                  {p.chunks_done}/{p.chunks_total}
                </span>
              )}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-foreground/60 transition-[width] duration-300"
                style={{
                  width: p.phase === "diarizing" ? "100%" : `${pct}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
