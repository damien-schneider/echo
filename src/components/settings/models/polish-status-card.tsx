import {
  AlertCircle,
  CircleCheck,
  CircleDashed,
  Download,
  Loader2,
} from "lucide-react";
import ProgressBar from "@/components/shared/progress-bar";
import { Button } from "@/components/ui/button";
import { polishStatusCopy } from "@/features/polish/polish-status-copy";
import type { PolishStatus } from "@/lib/types";

interface PolishStatusCardProps {
  onDownload: () => Promise<void>;
  onRepair: () => Promise<void>;
  progress?: number;
  status: PolishStatus;
}

const StatusIcon = ({ state }: Pick<PolishStatus, "state">) => {
  if (state === "ready") {
    return <CircleCheck className="h-4 w-4 text-emerald-500" />;
  }
  if (state === "repair") {
    return <AlertCircle className="h-4 w-4 text-destructive" />;
  }
  if (state === "not_downloaded") {
    return <Download className="h-4 w-4 text-muted-foreground" />;
  }
  return (
    <CircleDashed className="h-4 w-4 animate-pulse text-muted-foreground" />
  );
};

export const PolishStatusCard = ({
  onDownload,
  onRepair,
  progress,
  status,
}: PolishStatusCardProps) => {
  const copy = polishStatusCopy[status.state];
  const progressLabel =
    status.state === "downloading" && progress !== undefined
      ? ` ${Math.round(progress)}%`
      : "";

  return (
    <div className="rounded-lg border border-border/30 bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <StatusIcon state={status.state} />
          <div>
            <p className="font-medium text-sm">
              {copy.title}
              {progressLabel}
            </p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {copy.description}
            </p>
            {status.state === "repair" ? (
              <p className="mt-1 text-destructive text-xs">{status.message}</p>
            ) : null}
          </div>
        </div>
        {status.state === "repair" ? (
          <Button onClick={onRepair} size="sm" variant="secondary">
            {polishStatusCopy.repair.action}
          </Button>
        ) : null}
        {status.state === "not_downloaded" ? (
          <Button onClick={onDownload} size="sm">
            <Download aria-hidden="true" className="mr-1 h-4 w-4" />
            {polishStatusCopy.not_downloaded.action}
          </Button>
        ) : null}
        {status.state === "downloading" ? (
          <Button disabled={true} size="sm" variant="secondary">
            <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />
            Downloading
          </Button>
        ) : null}
      </div>
      {status.state === "downloading" && progress !== undefined ? (
        <ProgressBar
          className="mt-3"
          fullWidth={true}
          progress={[
            {
              id: "polish",
              label: `${Math.round(progress)}%`,
              percentage: progress,
            },
          ]}
          showLabel={true}
          size="small"
        />
      ) : null}
    </div>
  );
};
