import { useCallback, useMemo } from "react";
import { useMeetingStore } from "@/stores/meeting-store";
import { MeetingBatchProgressView } from "./meeting-batch-progress";
import { MeetingControls } from "./meeting-controls";
import { MeetingDetail } from "./meeting-detail";
import { MeetingList } from "./meeting-list";
import { MeetingSettings } from "./meeting-settings";
import { MeetingTranscript } from "./meeting-transcript";

export const MeetingPage = () => {
  const status = useMeetingStore((s) => s.status);
  const liveSegments = useMeetingStore((s) => s.liveSegments);
  const streamingFinals = useMeetingStore((s) => s.streamingFinals);
  const interimSegments = useMeetingStore((s) => s.interimSegments);
  const batchProgress = useMeetingStore((s) => s.batchProgress);
  const selectedMeeting = useMeetingStore((s) => s.selectedMeeting);
  const selectMeeting = useMeetingStore((s) => s.selectMeeting);

  const transcriptSegments = useMemo(
    () => [...streamingFinals, ...liveSegments],
    [streamingFinals, liveSegments]
  );

  const handleSelect = useCallback(
    (id: number) => {
      selectMeeting(id);
    },
    [selectMeeting]
  );

  if (status === "viewing" && selectedMeeting) {
    return (
      <div className="mx-auto h-full w-full max-w-3xl pb-20">
        <MeetingDetail />
      </div>
    );
  }

  if (status === "recording" || status === "processing") {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 pb-20">
        <MeetingControls />
        {status === "processing" && (
          <MeetingBatchProgressView progress={batchProgress} />
        )}
        <div className="min-h-0 flex-1">
          <h3 className="mb-2 font-medium text-muted-foreground text-sm">
            Live Transcript
          </h3>
          <MeetingTranscript
            autoScroll
            interimSegments={[interimSegments.mic, interimSegments.system]}
            segments={transcriptSegments}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-20">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-lg">Meeting Recording</h2>
          <MeetingControls />
        </div>

        <div>
          <h3 className="mb-2 font-medium text-muted-foreground text-sm">
            Settings
          </h3>
          <MeetingSettings />
        </div>

        <div>
          <h3 className="mb-2 font-medium text-muted-foreground text-sm">
            Past Meetings
          </h3>
          <MeetingList onSelect={handleSelect} />
        </div>
      </div>
    </div>
  );
};
