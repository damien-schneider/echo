import type {
  MeetingBatchProgress,
  MeetingSegment,
  StreamingSource,
} from "@/lib/types";

const SOURCES: StreamingSource[] = ["mic", "system"];

// a source keeps live text until its own batch rows start — mic transcribes while system still diarizes
export function visibleTranscript(
  streamingFinals: MeetingSegment[],
  batchSegments: MeetingSegment[],
  batchProgress: Record<string, MeetingBatchProgress | null>
): MeetingSegment[] {
  return SOURCES.flatMap((source) => {
    const batchRows = batchSegments.filter((s) => s.audio_source === source);
    const progress = batchProgress[source];
    const batchIsTranscribing =
      progress != null && progress.phase !== "diarizing";
    if (batchRows.length > 0 || batchIsTranscribing) {
      return batchRows;
    }
    return streamingFinals.filter((s) => s.audio_source === source);
  }).sort((a, b) => a.start_ms - b.start_ms);
}
