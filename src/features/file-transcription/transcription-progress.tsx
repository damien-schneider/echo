import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@ctrl-ui/react/ui/progress";

interface TranscriptionProgressProps {
  className?: string;
  message: string;
  progress: number;
}

export function TranscriptionProgress({
  progress,
  message,
  className,
}: TranscriptionProgressProps) {
  return (
    <Progress
      aria-label={message}
      className={className}
      max={1}
      value={progress < 0 ? null : progress}
    >
      <ProgressTrack className="h-1.5">
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  );
}
