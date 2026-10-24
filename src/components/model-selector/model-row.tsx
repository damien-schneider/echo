import { invoke } from "@tauri-apps/api/core";
import { type ReactNode, useId, useState } from "react";
import { ModelFileActions } from "@/components/model-selector/model-file-actions";
import ProgressBar from "@/components/shared/progress-bar";
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
  onDelete: () => Promise<void>;
  onReveal: () => Promise<void>;
}

export const revealModelFile = (modelId: string) => () =>
  invoke<void>("reveal_model_file", { modelId });

interface ModelRowProps {
  action?: ReactNode;
  badges?: ReactNode;
  className?: string;
  description: string;
  diskMb?: number;
  download?: ModelRowDownload;
  files?: ModelRowFiles;
  memoryMb?: number;
  name: string;
  status?: ModelRowStatus;
}

export const ModelRow = ({
  action,
  badges,
  className,
  description,
  diskMb,
  download,
  files,
  memoryMb,
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
  const footprint = [
    diskMb === undefined ? null : `Disk ${formatModelSize(diskMb)}`,
    memoryMb === undefined ? null : `RAM ~${formatModelSize(memoryMb)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-3", className)}
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
              {footprint}
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
              onReveal={reportingFailure(files.onReveal)}
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
