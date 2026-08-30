import type { MeetingSegment } from "@/lib/types";

export function orderedTranscript(
  streaming: MeetingSegment[],
  batch: MeetingSegment[]
): MeetingSegment[] {
  return [...streaming, ...batch].sort((a, b) => a.start_ms - b.start_ms);
}
