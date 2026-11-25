import { Badge } from "@ctrl-ui/react/ui/badge";
import { Button } from "@ctrl-ui/react/ui/button";
import { CheckIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { ModelActionButton } from "@/components/model-selector/model-action-button";
import {
  ModelRow,
  type ModelRowStatus,
  revealModelFile,
} from "@/components/model-selector/model-row";
import { LanguageFact } from "@/components/settings/models/language-fact";
import type {
  ModelTransfer,
  PolishCatalogModel,
} from "@/components/settings/models/use-polish-catalog";
import { modelActionPresentation } from "@/features/model-download/download-state";
import type { PolishStatus } from "@/lib/types";
import { formatModelSize } from "@/lib/utils/format";

const setupMessages = {
  loading: "Checking and loading…",
  preparing: "Preparing…",
  verifying: "Verifying model files…",
} as const;

interface PolishModelRowProps {
  activeStatus?: PolishStatus;
  error?: string;
  isBusy: boolean;
  isDeleting: boolean;
  isRepairing: boolean;
  isSelecting: boolean;
  model: PolishCatalogModel;
  onDelete: () => Promise<void>;
  onRepair: () => Promise<void>;
  onSelect: () => Promise<void>;
  transfer?: ModelTransfer;
}

const rowStatus = (
  {
    activeStatus,
    error,
    isDeleting,
    isRepairing,
    isSelecting,
    model,
    transfer,
  }: PolishModelRowProps,
  isDownloading: boolean
): ModelRowStatus | undefined => {
  if (error) {
    return { message: error, tone: "error" };
  }
  if (isDeleting) {
    return { message: "Deleting…", tone: "muted" };
  }
  if (isDownloading) {
    return;
  }
  if (
    transfer?.phase === "verifying" &&
    (isSelecting || model.is_downloading)
  ) {
    return { message: setupMessages.verifying, tone: "muted" };
  }
  const state = activeStatus?.state;
  if (state === "loading" || state === "preparing" || state === "verifying") {
    return { message: setupMessages[state], tone: "muted" };
  }
  if (isRepairing) {
    return { message: "Preparing repair…", tone: "muted" };
  }
  if (isSelecting) {
    return {
      message: model.is_downloaded
        ? setupMessages.loading
        : setupMessages.preparing,
      tone: "muted",
    };
  }
  if (activeStatus?.state === "repair") {
    return { message: activeStatus.message, tone: "error" };
  }
  if (!model.is_downloaded && model.partial_download_mb !== null) {
    return {
      message: `${formatModelSize(model.partial_download_mb)} of ${formatModelSize(model.download_size_mb)} downloaded`,
      tone: "muted",
    };
  }
};

const modelAction = (props: PolishModelRowProps, isDownloading: boolean) => {
  const {
    activeStatus,
    isBusy,
    isRepairing,
    isSelecting,
    model,
    onRepair,
    onSelect,
  } = props;
  if (!isDownloading && (isRepairing || isSelecting || model.is_downloading)) {
    return null;
  }
  if (!isDownloading && activeStatus?.state === "repair") {
    return (
      <Button disabled={isBusy} onClick={onRepair} size="sm" variant="surface">
        Repair
      </Button>
    );
  }
  return (
    <ModelActionButton
      action={modelActionPresentation({
        hasPartialDownload: model.partial_download_mb !== null,
        isActive: model.is_active && !isDownloading,
        isBusy,
        isDownloaded: model.is_downloaded,
        isDownloading,
      })}
      isDownloaded={model.is_downloaded}
      onClick={onSelect}
    />
  );
};

export const PolishModelRow = (props: PolishModelRowProps) => {
  const { activeStatus, isBusy, isSelecting, model, transfer } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusRowThen = (command: () => Promise<void>) => () => {
    headingRef.current?.focus();
    return command();
  };
  const isDownloading =
    transfer?.phase !== "verifying" &&
    (model.is_downloading ||
      activeStatus?.state === "downloading" ||
      (isSelecting &&
        !model.is_downloaded &&
        transfer?.phase === "downloading"));
  const hasFiles = model.is_downloaded || model.partial_download_mb !== null;
  return (
    <ModelRow
      action={modelAction(
        {
          ...props,
          onRepair: focusRowThen(props.onRepair),
          onSelect: focusRowThen(props.onSelect),
        },
        isDownloading
      )}
      badges={
        model.is_active && model.is_downloaded ? (
          <Badge className="gap-1" variant="default">
            <CheckIcon aria-hidden="true" className="h-3 w-3" />
            Active
          </Badge>
        ) : null
      }
      description={model.description}
      diskMb={model.download_size_mb}
      download={
        isDownloading && transfer?.phase === "downloading"
          ? { percentage: transfer.percentage }
          : undefined
      }
      files={
        hasFiles && !isDownloading
          ? {
              disabled: isBusy,
              onDelete: focusRowThen(props.onDelete),
              onReveal: revealModelFile(model.id),
            }
          : undefined
      }
      headingRef={headingRef}
      languages={<LanguageFact support={model.languages} />}
      memoryMb={model.memory_mb ?? undefined}
      name={model.name}
      status={rowStatus(props, isDownloading)}
    />
  );
};
