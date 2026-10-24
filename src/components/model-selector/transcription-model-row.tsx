import { Badge } from "@ctrl-ui/react/ui/badge";
import { CheckIcon } from "@phosphor-icons/react";
import { ModelActionButton } from "@/components/model-selector/model-action-button";
import {
  ModelRow,
  type ModelRowStatus,
  revealModelFile,
} from "@/components/model-selector/model-row";
import { modelActionPresentation } from "@/features/model-download/download-state";
import type { TranscriptionProfileStatus } from "@/lib/types";
import { formatModelSize } from "@/lib/utils/format";

const LOADING_STATUS: ModelRowStatus = {
  message: "Loading into memory…",
  tone: "muted",
};

const rowStatus = (
  profile: TranscriptionProfileStatus,
  isDownloading: boolean,
  isLoading: boolean
): ModelRowStatus | undefined => {
  if (isLoading) {
    return LOADING_STATUS;
  }
  if (
    profile.partial_download_mb === null ||
    profile.is_downloaded ||
    isDownloading
  ) {
    return;
  }
  return {
    message: `${formatModelSize(profile.partial_download_mb)} of ${formatModelSize(profile.download_size_mb)} downloaded`,
    tone: "muted",
  };
};

interface TranscriptionModelRowProps {
  className?: string;
  downloadProgress?: number;
  downloadSpeed?: number;
  isBusy: boolean;
  isLoading: boolean;
  onDelete?: () => Promise<void>;
  onSelect: () => void;
  profile: TranscriptionProfileStatus;
}

export const TranscriptionModelRow = ({
  className,
  downloadProgress,
  downloadSpeed,
  isBusy,
  isLoading,
  onDelete,
  onSelect,
  profile,
}: TranscriptionModelRowProps) => {
  const isDownloading = downloadProgress !== undefined;
  const hasPartialDownload =
    profile.partial_download_mb !== null && !profile.is_downloaded;
  const action = modelActionPresentation({
    hasPartialDownload,
    isActive: profile.is_active,
    isBusy,
    isDownloaded: profile.is_downloaded,
    isDownloading,
  });
  return (
    <ModelRow
      action={
        <ModelActionButton
          action={action}
          isDownloaded={profile.is_downloaded}
          onClick={onSelect}
        />
      }
      badges={
        <>
          {profile.is_recommended ? (
            <Badge variant="default">Recommended</Badge>
          ) : null}
          {profile.is_active ? (
            <Badge className="gap-1" variant="default">
              <CheckIcon aria-hidden="true" className="h-3 w-3" />
              Active
            </Badge>
          ) : null}
        </>
      }
      className={className}
      description={profile.description}
      diskMb={profile.download_size_mb}
      download={
        isDownloading
          ? { percentage: downloadProgress, speed: downloadSpeed }
          : undefined
      }
      files={
        (profile.is_downloaded || hasPartialDownload) &&
        !isDownloading &&
        onDelete
          ? {
              disabled: isBusy,
              onDelete,
              onReveal: revealModelFile(profile.size),
            }
          : undefined
      }
      memoryMb={profile.memory_mb}
      name={profile.label}
      status={rowStatus(profile, isDownloading, isLoading)}
    />
  );
};
