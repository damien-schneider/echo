import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMeetingModels } from "@/features/meeting/use-meeting-models";
import { cn, errorMessage } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meeting-store";
import { MeetingAudioPlayer } from "./meeting-audio-player";
import { MeetingExport } from "./meeting-export";
import { MeetingSummary } from "./meeting-summary";
import { MeetingTranscript } from "./meeting-transcript";

export const MeetingDetail = () => {
  const meeting = useMeetingStore((s) => s.selectedMeeting);
  const segments = useMeetingStore((s) => s.selectedSegments);
  const unselectMeeting = useMeetingStore((s) => s.unselectMeeting);
  const retranscribeMeeting = useMeetingStore((s) => s.retranscribeMeeting);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [retranscribing, setRetranscribing] = useState(false);
  const models = useMeetingModels();

  const handleSeek = (ms: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = ms / 1000;
    audio.play();
  };

  const handleRetranscribe = async () => {
    if (!meeting || retranscribing) {
      return;
    }
    setRetranscribing(true);
    try {
      await retranscribeMeeting(meeting.id);
      toast.success("Meeting retranscribed successfully");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to retranscribe meeting"));
    } finally {
      setRetranscribing(false);
    }
  };

  // Rust re-checks the models before transcribing, so a failed download surfaces as its toast.
  const handleBuildTranscript = async () => {
    await models.ensure();
    await handleRetranscribe();
  };

  if (!meeting) {
    return null;
  }

  const buildBusy = retranscribing || models.downloading;
  let buildLabel = models.ready ? "Transcribe" : models.label;
  if (buildBusy) {
    buildLabel = retranscribing ? "Transcribing…" : "Downloading…";
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button onClick={unselectMeeting} size="icon" variant="ghost">
            <ArrowLeft className="size-4" />
          </Button>
          <h2 className="font-semibold text-lg">{meeting.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={retranscribing}
            onClick={handleRetranscribe}
            size="sm"
            variant="outline"
          >
            <RefreshCw
              className={cn("mr-1 size-3", retranscribing && "animate-spin")}
            />
            {retranscribing ? "Retranscribing…" : "Retranscribe"}
          </Button>
          <MeetingExport meetingId={meeting.id} meetingTitle={meeting.title} />
        </div>
      </div>

      <MeetingAudioPlayer
        audioRef={audioRef}
        meetingId={meeting.id}
        meetingTitle={meeting.title}
      />

      {meeting.status === "recorded" && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2">
          <span className="text-muted-foreground text-sm">
            The transcript hasn't been built yet
          </span>
          <Button
            disabled={buildBusy}
            onClick={handleBuildTranscript}
            size="sm"
          >
            <RefreshCw
              className={cn("mr-1 size-3", buildBusy && "animate-spin")}
            />
            {buildLabel}
          </Button>
        </div>
      )}

      <MeetingSummary meetingId={meeting.id} summary={meeting.summary} />

      <div className="min-h-0 flex-1">
        <h3 className="mb-2 flex items-center gap-2 font-medium text-muted-foreground text-sm">
          Transcript
          {meeting.status === "partial" && (
            <span className="text-amber-500 text-xs">
              incomplete — Retranscribe to retry
            </span>
          )}
        </h3>
        <MeetingTranscript onSeek={handleSeek} segments={segments} />
      </div>
    </div>
  );
};
