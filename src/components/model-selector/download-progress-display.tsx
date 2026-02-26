import type React from "react";
import ProgressBar, {
  type ProgressData,
} from "@/components/shared/progress-bar";

interface DownloadProgress {
  downloaded: number;
  model_id: string;
  percentage: number;
  total: number;
}

interface DownloadStats {
  lastUpdate: number;
  speed: number;
  startTime: number;
  totalDownloaded: number;
}

interface DownloadProgressDisplayProps {
  className?: string;
  downloadProgress: Map<string, DownloadProgress>;
  downloadStats: Map<string, DownloadStats>;
}

const DownloadProgressDisplay: React.FC<DownloadProgressDisplayProps> = ({
  downloadProgress,
  downloadStats,
  className = "",
}) => {
  if (downloadProgress.size === 0) {
    return null;
  }

  const progressData: ProgressData[] = Array.from(
    downloadProgress.values()
  ).map((progress) => {
    const stats = downloadStats.get(progress.model_id);
    return {
      id: progress.model_id,
      percentage: progress.percentage,
      speed: stats?.speed,
    };
  });

  return (
    <ProgressBar
      className={className}
      progress={progressData}
      showSpeed={downloadProgress.size === 1}
      size="medium"
    />
  );
};

export default DownloadProgressDisplay;
