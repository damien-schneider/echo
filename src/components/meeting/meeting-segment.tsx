import type { MeetingSegment } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface MeetingSegmentItemProps {
  onSeek?: (ms: number) => void;
  segment: MeetingSegment;
  showSpeaker?: boolean;
}

export const MeetingSegmentItem = ({
  segment,
  onSeek,
  showSpeaker = true,
}: MeetingSegmentItemProps) => {
  const isMic = segment.audio_source === "mic";
  const isClickable = !!onSeek;

  return (
    <button
      className={cn(
        "flex w-full gap-3 rounded-md px-2 py-1.5 text-left",
        isClickable
          ? "cursor-pointer hover:bg-foreground/10 active:bg-foreground/15"
          : "hover:bg-foreground/5"
      )}
      disabled={!isClickable}
      onClick={() => onSeek?.(segment.start_ms)}
      style={{ containIntrinsicSize: "auto 36px", contentVisibility: "auto" }}
      type="button"
    >
      <span className="shrink-0 font-mono text-muted-foreground text-xs leading-6">
        [{formatMs(segment.start_ms)}]
      </span>
      {showSpeaker && (
        <span
          className={cn(
            "shrink-0 font-medium text-sm leading-6",
            isMic ? "text-blue-500" : "text-emerald-500"
          )}
        >
          {segment.speaker_label}:
        </span>
      )}
      <span className="text-sm leading-6">{segment.text}</span>
    </button>
  );
};
