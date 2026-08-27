import { Download, Loader2, Mic, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatElapsed } from "@/features/meeting/format-elapsed";
import { useDiarizationModel } from "@/features/model-download/use-diarization-model";
import { useMeetingStore } from "@/stores/meeting-store";

interface MeetingControlsProps {
  onStarted?: () => void;
}

export const MeetingControls = ({ onStarted }: MeetingControlsProps) => {
  const status = useMeetingStore((s) => s.status);
  const elapsedMs = useMeetingStore((s) => s.elapsedMs);
  const setElapsedMs = useMeetingStore((s) => s.setElapsedMs);
  const startMeeting = useMeetingStore((s) => s.startMeeting);
  const stopMeeting = useMeetingStore((s) => s.stopMeeting);
  const [title, setTitle] = useState("");

  const isRecording = status === "recording";
  const isProcessing = status === "processing";
  const diarization = useDiarizationModel();
  const modelReady = diarization.status?.downloaded ?? false;
  const modelDownloading = diarization.status?.downloading ?? false;
  let modelButtonIcon = <Download className="mr-1.5 size-3.5" />;
  let modelButtonLabel = "Model required";
  if (modelReady) {
    modelButtonIcon = <Mic className="mr-1.5 size-3.5" />;
    modelButtonLabel = "Start Meeting";
  } else if (modelDownloading) {
    modelButtonIcon = <Loader2 className="mr-1.5 size-3.5 animate-spin" />;
    modelButtonLabel = "Downloading…";
  }

  // elapsedMs is read once, not depended on — as a dependency the ticker would tear itself down
  // and rebuild five times a second for the whole meeting.
  useEffect(() => {
    if (!isRecording) {
      return;
    }
    const startedAt = Date.now() - useMeetingStore.getState().elapsedMs;
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 200);
    return () => {
      clearInterval(timer);
    };
  }, [isRecording, setElapsedMs]);

  const handleStart = async () => {
    try {
      await startMeeting(title || undefined);
      onStarted?.();
    } catch (e) {
      const msg = typeof e === "string" ? e : "Failed to start meeting";
      toast.error(msg);
    }
  };

  const handleStop = async () => {
    try {
      await stopMeeting();
    } catch {
      toast.error("Failed to stop meeting");
    }
  };

  if (isRecording || isProcessing) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-sm">
            {isProcessing ? "Processing..." : formatElapsed(elapsedMs)}
          </span>
        </div>
        <Button
          disabled={isProcessing}
          onClick={handleStop}
          size="sm"
          variant="destructive"
        >
          <Square className="mr-1.5 size-3.5" />
          Stop Meeting
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          className="h-9 rounded-md border border-border/40 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title (optional)"
          type="text"
          value={title}
        />
        <Button disabled={!modelReady} onClick={handleStart} size="sm">
          {modelButtonIcon}
          {modelButtonLabel}
        </Button>
      </div>
      {!modelReady && (
        <p className="text-muted-foreground text-xs">
          {modelDownloading
            ? "Downloading the speaker detection model in Meeting Settings."
            : "Download the speaker detection model in Meeting Settings."}
        </p>
      )}
    </div>
  );
};
