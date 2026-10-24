import { Badge } from "@ctrl-ui/react/ui/badge";
import { Button } from "@ctrl-ui/react/ui/button";
import {
  CheckIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";
import {
  ModelRow,
  type ModelRowStatus,
} from "@/components/model-selector/model-row";
import { modelActionPresentation } from "@/features/model-download/download-state";
import type { TranscriptionProfileStatus } from "@/lib/types";

const LOADING_STATUS: ModelRowStatus = {
  message: "Loading into memory…",
  tone: "muted",
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
  const action = modelActionPresentation({
    isActive: profile.is_active,
    isBusy,
    isDownloaded: profile.is_downloaded,
    isDownloading,
  });
  return (
    <ModelRow
      action={
        action.show ? (
          <Button
            disabled={action.disabled}
            onClick={onSelect}
            size="sm"
            tone="primary"
            variant="solid"
          >
            {action.showSpinner ? (
              <CircleNotchIcon
                aria-hidden="true"
                className="mr-1 h-4 w-4 animate-spin"
              />
            ) : null}
            {action.showSpinner || profile.is_downloaded ? null : (
              <DownloadSimpleIcon aria-hidden="true" className="mr-1 h-4 w-4" />
            )}
            {action.label}
          </Button>
        ) : null
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
      download={
        isDownloading
          ? { percentage: downloadProgress, speed: downloadSpeed }
          : undefined
      }
      files={
        profile.is_downloaded && !isDownloading && onDelete
          ? { disabled: isBusy, modelId: profile.size, onDelete }
          : undefined
      }
      footprint={profile}
      name={profile.label}
      status={isLoading ? LOADING_STATUS : undefined}
    />
  );
};
