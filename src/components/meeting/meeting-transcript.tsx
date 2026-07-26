import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { MeetingSegment } from "@/lib/types";
import type { InterimSegmentState } from "@/stores/meeting-store";
import { MeetingSegmentItem } from "./meeting-segment";

interface MeetingTranscriptProps {
  autoScroll?: boolean;
  // Per-source interims shown after committed segments while recording.
  interimSegments?: (InterimSegmentState | null)[];
  onSeek?: (ms: number) => void;
  segments: MeetingSegment[];
}

export const MeetingTranscript = ({
  segments,
  autoScroll = false,
  onSeek,
  interimSegments,
}: MeetingTranscriptProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(segments.length);
  const activeInterims = (interimSegments ?? []).filter(
    (i): i is InterimSegmentState =>
      i !== null && (i.committedText !== "" || i.tentativeText !== "")
  );

  useEffect(() => {
    if (
      autoScroll &&
      segments.length !== prevCountRef.current &&
      bottomRef.current
    ) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = segments.length;
  });

  if (segments.length === 0 && activeInterims.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        No transcript segments yet
      </div>
    );
  }

  const uniqueSpeakers = new Set(segments.map((s) => s.speaker_label));
  const hasDiarization = uniqueSpeakers.size > 1;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-0.5 p-2">
        {segments.map((seg) => (
          <MeetingSegmentItem
            key={seg.id || `${seg.start_ms}-${seg.speaker_label}`}
            onSeek={onSeek}
            segment={seg}
            showSpeaker={hasDiarization}
          />
        ))}
        {activeInterims.map((interim) => (
          <div
            className="flex w-full gap-3 px-2 py-1.5 text-left text-muted-foreground italic opacity-80"
            key={`interim-${interim.source}-${interim.segmentStartMs}`}
          >
            <span className="shrink-0 font-mono text-xs leading-6">
              [live · {interim.source}]
            </span>
            <span className="text-sm leading-6">
              {interim.committedText && (
                <span className="text-foreground/70 not-italic">
                  {interim.committedText}{" "}
                </span>
              )}
              {interim.tentativeText}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
};
