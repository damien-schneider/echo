import { ChevronDown, Trash2Icon } from "lucide-react";
import React from "react";
import ProgressBar from "@/components/shared/progress-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { ModelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatModelSize } from "@/lib/utils/format";

type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "extracting"
  | "error"
  | "unloaded"
  | "none";

const getStatusColor = (status: ModelStatus): string => {
  switch (status) {
    case "ready":
      return "bg-brand";
    case "loading":
      return "bg-muted-foreground animate-pulse";
    case "downloading":
      return "bg-brand animate-pulse";
    case "extracting":
      return "bg-brand/70 animate-pulse";
    case "error":
      return "bg-destructive";
    case "unloaded":
      return "bg-muted";
    case "none":
      return "bg-destructive";
    default:
      return "bg-muted";
  }
};

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

interface ModelDropdownProps {
  models: ModelInfo[];
  currentModelId: string;
  downloadProgress: Map<string, DownloadProgress>;
  onModelSelect: (modelId: string) => void;
  onModelDownload: (modelId: string) => void;
  onModelDelete: (modelId: string) => Promise<void>;
  onError?: (error: string) => void;
  status: ModelStatus;
  displayText: string;
}

const ModelDropdown: React.FC<ModelDropdownProps> = ({
  models,
  currentModelId,
  downloadProgress,
  onModelSelect,
  onModelDownload,
  onModelDelete,
  onError,
  status,
  displayText,
}) => {
  const [open, setOpen] = React.useState(false);
  const availableModels = models.filter((m) => m.is_downloaded);
  const downloadableModels = models.filter((m) => !m.is_downloaded);
  const isFirstRun = availableModels.length === 0 && models.length > 0;

  const handleDeleteClick = async (e: React.MouseEvent, modelId: string) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await onModelDelete(modelId);
    } catch (err) {
      const errorMsg = `Failed to delete model: ${err}`;
      onError?.(errorMsg);
    }
  };

  const handleModelClick = (modelId: string) => {
    if (downloadProgress.has(modelId)) {
      return; // Don't allow interaction while downloading
    }
    onModelSelect(modelId);
    setOpen(false);
  };

  const handleDownloadClick = (modelId: string) => {
    if (downloadProgress.has(modelId)) {
      return; // Don't allow interaction while downloading
    }
    onModelDownload(modelId);
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex items-center gap-2 transition-colors hover:text-text/80"
          size="xs"
          title={`Model status: ${displayText}`}
          variant="ghost"
        >
          <div className={cn("h-2 w-2 rounded-full", getStatusColor(status))} />
          <span className="max-w-28 truncate">{displayText}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-92 p-0!" side="top">
        <ScrollArea
          className="p-0! *:max-h-[200px] *:p-2"
          disableMaskingSide={["left", "right"]}
        >
          <ScrollBar orientation="vertical" />
          {/* First Run Welcome */}
          {isFirstRun && (
            <div className="mb-1 rounded-xl border border-foreground/10 bg-background/10 px-3 py-2 backdrop-blur-lg">
              <div className="mb-1 font-medium text-foreground text-xs">
                Welcome to Echo!
              </div>
              <div className="text-foreground/80 text-xs">
                Download a model below to get started with transcription.
              </div>
            </div>
          )}

          {/* Available Models */}
          {availableModels.length > 0 && (
            <>
              <DropdownMenuLabel>Available Models</DropdownMenuLabel>
              {availableModels.map((model) => (
                <DropdownMenuItem
                  className={cn(
                    "cursor-pointer",
                    currentModelId === model.id
                      ? "bg-foreground/10 text-foreground"
                      : ""
                  )}
                  key={model.id}
                  onClick={() => handleModelClick(model.id)}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm tracking-tight">
                        {model.name}
                      </div>
                      <div className="pr-4 text-[0.65rem] text-foreground/80 italic">
                        {model.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {currentModelId === model.id && (
                        <div className="text-foreground text-xs">Active</div>
                      )}
                      {currentModelId !== model.id && (
                        <Button
                          onClick={(e) => handleDeleteClick(e, model.id)}
                          size="icon-xs"
                          title={`Delete ${model.name}`}
                          variant="ghostDestructive"
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}

          {/* Downloadable Models */}
          {downloadableModels.length > 0 && (
            <>
              {(availableModels.length > 0 || isFirstRun) && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {isFirstRun ? "Choose a Model" : "Download Models"}
              </DropdownMenuLabel>
              {downloadableModels.map((model) => {
                const isDownloading = downloadProgress.has(model.id);
                const progress = downloadProgress.get(model.id);

                return (
                  <DropdownMenuItem
                    className="cursor-pointer flex-col items-start"
                    disabled={isDownloading}
                    key={model.id}
                    onClick={() => handleDownloadClick(model.id)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm">
                          {model.name}
                          {model.id === "small" && isFirstRun && (
                            <span className="ml-2 rounded bg-brand/20 px-1.5 py-0.5 text-brand text-xs">
                              Recommended
                            </span>
                          )}
                        </div>
                        <div className="pr-4 text-muted-foreground/50 text-xs italic">
                          {model.description}
                        </div>
                        <div className="mt-1 text-muted-foreground/60 text-xs tabular-nums">
                          Download size · {formatModelSize(model.size_mb)}
                        </div>
                      </div>
                      <div className="font-mono text-brand text-xs tabular-nums">
                        {isDownloading && progress
                          ? `${Math.max(0, Math.min(100, Math.round(progress.percentage)))}%`
                          : "Download"}
                      </div>
                    </div>

                    {isDownloading && progress && (
                      <div className="mt-2 w-full">
                        <ProgressBar
                          progress={[
                            {
                              id: model.id,
                              percentage: progress.percentage,
                              label: model.name,
                            },
                          ]}
                          size="small"
                        />
                      </div>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </>
          )}

          {/* No Models Available */}
          {availableModels.length === 0 && downloadableModels.length === 0 && (
            <div className="px-2 py-1.5 text-muted-foreground text-sm">
              No models available
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ModelDropdown;
