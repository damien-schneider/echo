import { cn } from "@/lib/utils";

export interface ProgressData {
  id: string;
  label?: string;
  percentage: number;
  speed?: number;
}

interface ProgressBarProps {
  ariaLabel?: string;
  className?: string;
  fullWidth?: boolean;
  progress: ProgressData[];
  showLabel?: boolean;
  showSpeed?: boolean;
  size?: "small" | "medium" | "large";
}

const ProgressBar = ({
  ariaLabel,
  progress,
  className = "",
  fullWidth = false,
  size = "medium",
  showSpeed = false,
  showLabel = false,
}: ProgressBarProps) => {
  const sizeClasses = {
    large: "w-24 h-2",
    medium: "w-20 h-1.5",
    small: "w-16 h-1",
  };

  const progressClasses = sizeClasses[size];

  if (progress.length === 0) {
    return null;
  }

  if (progress.length === 1) {
    const item = progress[0];
    if (!item) {
      return null;
    }
    const percentage = Math.max(0, Math.min(100, item.percentage));

    return (
      <div
        className={cn(
          "flex items-center gap-3",
          fullWidth && "w-full",
          className
        )}
      >
        <progress
          aria-label={ariaLabel}
          className={cn(
            progressClasses,
            fullWidth && "min-w-0 flex-1",
            "[&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted/20 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
          )}
          max={100}
          value={percentage}
        />
        {(showSpeed || showLabel) && (
          <div className="min-w-fit text-text/60 text-xs tabular-nums">
            {showLabel && item.label && (
              <span className="mr-2">{item.label}</span>
            )}
            {showSpeed &&
              (item.speed !== undefined && item.speed > 0 ? (
                <span>{item.speed.toFixed(1)}MB/s</span>
              ) : (
                <span>Downloading...</span>
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex gap-1">
        {progress.map((item) => {
          const percentage = Math.max(0, Math.min(100, item.percentage));
          return (
            <progress
              aria-label={ariaLabel}
              className="h-1.5 w-3 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted/20 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
              key={item.id}
              max={100}
              title={item.label || `${percentage}%`}
              value={percentage}
            />
          );
        })}
      </div>
      <div className="min-w-fit text-text/60 text-xs">
        {progress.length} downloading...
      </div>
    </div>
  );
};

export default ProgressBar;
