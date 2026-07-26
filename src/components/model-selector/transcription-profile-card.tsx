import { Check, Download, Loader2, Trash2 } from "lucide-react";
import ProgressBar from "@/components/shared/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { modelActionPresentation } from "@/features/model-download/download-state";
import type { TranscriptionProfileStatus } from "@/lib/types";
import { formatModelSize } from "@/lib/utils/format";

interface TranscriptionProfileCardProps {
  downloadProgress?: number;
  downloadSpeed?: number;
  isBusy: boolean;
  onDelete?: () => void;
  onSelect: () => void;
  profile: TranscriptionProfileStatus;
}

export const TranscriptionProfileCard = ({
  downloadProgress,
  downloadSpeed,
  isBusy,
  onDelete,
  onSelect,
  profile,
}: TranscriptionProfileCardProps) => {
  const isDownloading = downloadProgress !== undefined;
  const action = modelActionPresentation({
    isActive: profile.is_active,
    isBusy,
    isDownloaded: profile.is_downloaded,
    isDownloading,
  });

  return (
    <div className="rounded-xl border border-border/30 bg-card p-4 transition-colors hover:border-border/60">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-foreground">{profile.label}</h3>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatModelSize(profile.download_size_mb)}
            </span>
            {profile.size === "medium" ? (
              <Badge variant="secondary">Recommended</Badge>
            ) : null}
            {profile.is_active ? (
              <Badge className="gap-1" variant="default">
                <Check aria-hidden="true" className="h-3 w-3" />
                Active
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            {profile.description}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {profile.is_downloaded && !profile.is_active && onDelete ? (
            <Button
              disabled={isBusy}
              onClick={onDelete}
              size="icon-sm"
              title={`Delete ${profile.label} model`}
              variant="ghostDestructive"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          ) : null}
          {action.show ? (
            <Button disabled={action.disabled} onClick={onSelect} size="sm">
              {action.showSpinner ? (
                <Loader2
                  aria-hidden="true"
                  className="mr-1 h-4 w-4 animate-spin"
                />
              ) : (
                <Download aria-hidden="true" className="mr-1 h-4 w-4" />
              )}
              {action.label}
            </Button>
          ) : null}
        </div>
      </div>

      {isDownloading ? (
        <div className="mt-3">
          <ProgressBar
            fullWidth={true}
            progress={[
              {
                id: profile.size,
                label: `${Math.round(downloadProgress)}%`,
                percentage: downloadProgress,
                speed: downloadSpeed,
              },
            ]}
            showLabel={true}
            showSpeed={true}
            size="small"
          />
        </div>
      ) : null}
    </div>
  );
};
