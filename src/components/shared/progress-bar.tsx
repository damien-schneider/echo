import type React from "react";
import { cn } from "@/lib/utils";

export interface ProgressData {
  id: string;
  label?: string;
  percentage: number;
  speed?: number;
}

interface ProgressBarProps {
  className?: string;
  progress: ProgressData[];
  showLabel?: boolean;
  showSpeed?: boolean;
  size?: "small" | "medium" | "large";
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  className = "",
  size = "medium",
  showSpeed = false,
  showLabel = false,
}) => {
  const sizeClasses = {
    small: "w-16 h-1",
    medium: "w-20 h-1.5",
    large: "w-24 h-2",
  };

  const progressClasses = sizeClasses[size];

  if (progress.length === 0) {
    return null;
  }

  if (progress.length === 1) {
    // Single progress bar
    const item = progress[0];
    if (!item) {
      return null;
    }
    const percentage = Math.max(0, Math.min(100, item.percentage));

    return (
      <div className={cn("flex items-center gap-3", className)}>
        <progress
          className={cn(
            progressClasses,
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

  // Multiple progress bars
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex gap-1">
        {progress.map((item) => {
          const percentage = Math.max(0, Math.min(100, item.percentage));
          return (
            <progress
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
