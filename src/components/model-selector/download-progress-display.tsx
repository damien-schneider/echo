import type React from "react";
import ProgressBar, {
  type ProgressData,
} from "@/components/shared/progress-bar";

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

interface DownloadStats {
  startTime: number;
  lastUpdate: number;
  totalDownloaded: number;
  speed: number;
}

interface DownloadProgressDisplayProps {
  downloadProgress: Map<string, DownloadProgress>;
  downloadStats: Map<string, DownloadStats>;
  className?: string;
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
