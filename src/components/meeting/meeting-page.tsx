import { toast } from "sonner";
import { MeetingBatchProgressView } from "@/components/meeting/meeting-batch-progress";
import { MeetingControls } from "@/components/meeting/meeting-controls";
import { MeetingDetail } from "@/components/meeting/meeting-detail";
import { MeetingList } from "@/components/meeting/meeting-list";
import { MeetingSettings } from "@/components/meeting/meeting-settings";
import { MeetingTranscript } from "@/components/meeting/meeting-transcript";
import { visibleTranscript } from "@/features/meeting/transcript-order";
import { SettingsSection } from "@/features/settings/settings-section";
import { errorMessage } from "@/lib/utils";
import { meetingPageView, useMeetingStore } from "@/stores/meeting-store";

export const MeetingPage = () => {
  const view = useMeetingStore(meetingPageView);
  const activity = useMeetingStore((s) => s.activity);
  const liveSegments = useMeetingStore((s) => s.liveSegments);
  const streamingFinals = useMeetingStore((s) => s.streamingFinals);
  const interimSegments = useMeetingStore((s) => s.interimSegments);
  const batchProgress = useMeetingStore((s) => s.batchProgress);
  const selectMeeting = useMeetingStore((s) => s.selectMeeting);

  const transcriptSegments = visibleTranscript(
    streamingFinals,
    liveSegments,
    batchProgress
  );

  if (view === "detail") {
    return (
      <div className="mx-auto h-full w-full max-w-3xl pb-20">
        <MeetingDetail />
      </div>
    );
  }

  if (view === "live") {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 pb-20">
        <MeetingControls />
        {activity === "processing" && (
          <MeetingBatchProgressView progress={batchProgress} />
        )}
        <div className="min-h-0 flex-1">
          <h3 className="mb-2 font-medium text-label text-muted-foreground">
            {activity === "recording" ? "Live Transcript" : "Transcript"}
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
    <div className="space-y-5">
      <div className="px-1 pt-3">
        <MeetingControls />
      </div>
      <MeetingSettings />
      <SettingsSection title="Past meetings">
        <div className="p-1">
          <MeetingList
            onSelect={(id) => {
              selectMeeting(id).catch((error: unknown) => {
                toast.error(
                  errorMessage(error, "Couldn't open the meeting — try again")
                );
              });
            }}
          />
        </div>
      </SettingsSection>
    </div>
  );
};
