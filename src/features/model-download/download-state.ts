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
  hasPartialDownload: boolean;
  isActive: boolean;
  isBusy: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
}

const actionLabel = ({
  hasPartialDownload,
  isDownloaded,
  isDownloading,
}: Omit<ModelActionOptions, "isActive" | "isBusy">) => {
  if (isDownloading) {
    return "Downloading";
  }
  if (isDownloaded) {
    return "Use";
  }
  return hasPartialDownload ? "Resume" : "Download";
};

export interface ModelActionPresentation {
  disabled: boolean;
  label: "Download" | "Downloading" | "Resume" | "Use";
  show: boolean;
  showSpinner: boolean;
}

export const modelActionPresentation = (
  options: ModelActionOptions
): ModelActionPresentation => ({
  disabled: options.isBusy,
  label: actionLabel(options),
  show: !(options.isActive && options.isDownloaded),
  showSpinner: options.isDownloading,
});
