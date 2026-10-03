import { Button } from "@ctrl-ui/react/ui/button";
import { Slider } from "@ctrl-ui/react/ui/slider";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Download, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
interface MeetingAudioPlayerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  meetingId: number;
  meetingTitle?: string;
}
export const MeetingAudioPlayer = ({
  meetingId,
  meetingTitle,
  audioRef,
}: MeetingAudioPlayerProps) => {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const loadAudio = async () => {
      const path = await invoke<string | null>("get_meeting_audio_path", {
        meetingId,
      });
      if (!cancelled && path) {
        setAudioSrc(convertFileSrc(path, "asset"));
      }
    };
    loadAudio();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    setDuration(e.currentTarget.duration);
  };
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };
  const seekAudio = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
    }
  };
  if (!audioSrc) {
    return null;
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/20 px-3 py-2">
      <audio
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={handleLoadedMetadata}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={handleTimeUpdate}
        preload="metadata"
        ref={audioRef}
        src={audioSrc}
      >
        <track kind="captions" />
      </audio>

      <Button
        aria-label={isPlaying ? "Pause audio" : "Play audio"}
        className="size-7 shrink-0"
        iconOnly
        onClick={togglePlay}
        size="md"
        variant="ghost"
      >
        {isPlaying ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )}
      </Button>

      <span className="shrink-0 font-mono text-muted-foreground text-xs">
        {formatTime(currentTime)}
      </span>

      <Slider
        aria-label="Audio progress"
        className="min-w-0 flex-1"
        disabled={duration === 0}
        max={duration}
        onValueChange={seekAudio}
        step={5}
        value={currentTime}
        variant="plain"
      />

      <span className="shrink-0 font-mono text-muted-foreground text-xs">
        {formatTime(duration)}
      </span>

      <Button
        aria-label="Download audio"
        className="size-7 shrink-0"
        iconOnly
        onClick={async () => {
          const response = await fetch(audioSrc);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${meetingTitle ?? "meeting"}.wav`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }}
        size="md"
        variant="ghost"
      >
        <Download className="size-3.5" />
      </Button>
    </div>
  );
};
