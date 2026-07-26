import { z } from "zod";

export const DownloadProgressSchema = z
  .object({
    downloaded: z.number().nonnegative(),
    model_id: z.string(),
    percentage: z.number().min(0).max(100),
    total: z.number().nonnegative(),
  })
  .strict();

export type DownloadProgress = z.infer<typeof DownloadProgressSchema>;

export interface DownloadStats {
  lastUpdate: number;
  speed: number;
  totalDownloaded: number;
}

interface ClearDownloadFailureOptions {
  modelId: string;
  progress: Map<string, DownloadProgress>;
  stats: Map<string, DownloadStats>;
}

export const clearDownloadFailure = ({
  modelId,
  progress,
  stats,
}: ClearDownloadFailureOptions) => {
  const nextProgress = new Map(progress);
  const nextStats = new Map(stats);
  nextProgress.delete(modelId);
  nextStats.delete(modelId);
  return { progress: nextProgress, stats: nextStats };
};

interface ModelActionOptions {
  isActive: boolean;
  isBusy: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
}

export const modelActionPresentation = ({
  isActive,
  isBusy,
  isDownloaded,
  isDownloading,
}: ModelActionOptions) => {
  let label = "Download";
  if (isDownloading) {
    label = "Downloading";
  } else if (isDownloaded) {
    label = "Use";
  }
  return {
    disabled: isBusy,
    label,
    show: !(isActive && isDownloaded),
    showSpinner: isDownloading,
  };
};
