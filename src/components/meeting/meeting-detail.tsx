import { ArrowLeft, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    } catch {
      toast.error("Failed to retranscribe meeting");
    } finally {
      setRetranscribing(false);
    }
  };

  if (!meeting) {
    return null;
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

      <MeetingSummary meetingId={meeting.id} summary={meeting.summary} />

      <div className="min-h-0 flex-1">
        <h3 className="mb-2 font-medium text-muted-foreground text-sm">
          Transcript
        </h3>
        <MeetingTranscript onSeek={handleSeek} segments={segments} />
      </div>
    </div>
  );
};
