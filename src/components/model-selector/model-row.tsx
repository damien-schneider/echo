import { invoke } from "@tauri-apps/api/core";
import { type ReactNode, useId, useState } from "react";
import { ModelFileActions } from "@/components/model-selector/model-file-actions";
import ProgressBar from "@/components/shared/progress-bar";
import type { ModelFootprint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatModelSize } from "@/lib/utils/format";

export interface ModelRowStatus {
  message: string;
  tone: "error" | "muted";
}

export interface ModelRowDownload {
  percentage: number;
  speed?: number;
}

export interface ModelRowFiles {
  disabled: boolean;
  modelId: string;
  onDelete: () => Promise<void>;
}

interface ModelRowProps {
  action?: ReactNode;
  badges?: ReactNode;
  className?: string;
  description: string;
  download?: ModelRowDownload;
  files?: ModelRowFiles;
  footprint?: ModelFootprint;
  name: string;
  status?: ModelRowStatus;
}

export const ModelRow = ({
  action,
  badges,
  className,
  description,
  download,
  files,
  footprint,
  name,
  status,
}: ModelRowProps) => {
  const headingId = useId();
  const [fileActionError, setFileActionError] = useState<string>();
  const reportingFailure = (fileAction: () => Promise<void>) => async () => {
    setFileActionError(undefined);
    try {
      await fileAction();
    } catch (error) {
      setFileActionError(`${error}`);
    }
  };

  return (
    <article
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-3 px-4 py-3", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-label" id={headingId}>
              {name}
            </h3>
            {badges}
          </div>
          {footprint ? (
            <p className="mt-0.5 text-caption text-muted-foreground tabular-nums">
              Disk {formatModelSize(footprint.download_size_mb)} · RAM ~
              {formatModelSize(footprint.memory_mb)}
            </p>
          ) : null}
          <p className="mt-1 text-caption text-muted-foreground">
            {description}
          </p>
          {status ? (
            <p
              className={cn(
                "mt-1 text-caption",
                status.tone === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {status.message}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {files ? (
            <ModelFileActions
              disabled={files.disabled}
              modelName={name}
              onDelete={reportingFailure(files.onDelete)}
              onReveal={reportingFailure(() =>
                invoke<void>("reveal_model_file", { modelId: files.modelId })
              )}
            />
          ) : null}
          {action}
        </div>
      </div>
      {download ? (
        <ProgressBar
          ariaLabel={`${name} download`}
          fullWidth={true}
          progress={[
            {
              id: name,
              label: `${Math.round(download.percentage)}%`,
              percentage: download.percentage,
              speed: download.speed,
            },
          ]}
          showLabel={true}
          showSpeed={(download.speed ?? 0) > 0}
          size="small"
        />
      ) : null}
      {fileActionError ? (
        <p className="text-caption text-destructive" role="alert">
          {fileActionError}
        </p>
      ) : null}
    </article>
  );
};
