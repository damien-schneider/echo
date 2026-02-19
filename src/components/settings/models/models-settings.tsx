import { Check, Download, Loader2, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import ProgressBar from "@/components/shared/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ModelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatModelSize } from "@/lib/utils/format";
import { type ModelStatus, useModelStore } from "@/stores/model-store";

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

const getStatusLabel = (status: ModelStatus): string => {
  switch (status) {
    case "ready":
      return "Ready";
    case "loading":
      return "Loading...";
    case "downloading":
      return "Downloading...";
    case "extracting":
      return "Extracting...";
    case "error":
      return "Error";
    case "unloaded":
      return "Unloaded";
    case "none":
      return "No Model";
    default:
      return "Unknown";
  }
};

const getDownloadButtonText = (
  isExtracting: boolean,
  isDownloading: boolean
): string => {
  if (isExtracting) {
    return "Extracting...";
  }
  if (isDownloading) {
    return "Downloading...";
  }
  return "Download";
};

const noop = () => {
  // intentionally empty - used for downloadable models that can't be deleted
};

interface ModelCardProps {
  model: ModelInfo;
  isActive: boolean;
  isDownloading: boolean;
  isExtracting: boolean;
  downloadProgress?: { percentage: number };
  downloadSpeed?: number;
  onSelect: () => void;
  onDelete: () => void;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  isActive,
  isDownloading,
  isExtracting,
  downloadProgress,
  downloadSpeed,
  onSelect,
  onDelete,
}) => {
  const isProcessing = isDownloading || isExtracting;

  let downloadSection: React.ReactNode = null;
  if (isDownloading && downloadProgress) {
    downloadSection = (
      <div className="mt-3">
        <ProgressBar
          progress={[
            {
              id: model.id,
              percentage: downloadProgress.percentage,
              speed: downloadSpeed,
            },
          ]}
          showSpeed={true}
          size="small"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/20 bg-card p-4 transition-colors hover:border-border/40">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground">{model.name}</h3>
            {isActive ? (
              <Badge className="gap-1" variant="default">
                <Check className="h-3 w-3" />
                Active
              </Badge>
            ) : null}
            {model.id === "small" && !model.is_downloaded && (
              <Badge variant="secondary">Recommended</Badge>
            )}
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            {model.description}
          </p>
          <div className="mt-2 flex items-center gap-4 text-muted-foreground text-xs">
            <span>{formatModelSize(model.size_mb)}</span>
            <div className="flex items-center gap-1">
              <span>Accuracy:</span>
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted/30">
                <div
                  className="h-full rounded-full bg-foreground/60"
                  style={{ width: `${model.accuracy_score * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span>Speed:</span>
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted/30">
                <div
                  className="h-full rounded-full bg-foreground/60"
                  style={{ width: `${model.speed_score * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {model.is_downloaded ? (
            <>
              {!isActive && (
                <Button onClick={onSelect} size="sm" variant="outline">
                  Select
                </Button>
              )}
              {!isActive && (
                <Button
                  onClick={onDelete}
                  size="icon-sm"
                  title="Delete model"
                  variant="ghostDestructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </>
          ) : (
            <Button
              disabled={isProcessing}
              onClick={onSelect}
              size="sm"
              variant="default"
            >
              {isProcessing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1 h-4 w-4" />
              )}
              {getDownloadButtonText(isExtracting, isDownloading)}
            </Button>
          )}
        </div>
      </div>

      {downloadSection}
    </div>
  );
};

const WhisperModelsContent = () => {
  const models = useModelStore((s) => s.models);
  const currentModelId = useModelStore((s) => s.currentModelId);
  const modelStatus = useModelStore((s) => s.modelStatus);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const downloadStats = useModelStore((s) => s.downloadStats);
  const extractingModels = useModelStore((s) => s.extractingModels);

  const initialize = useModelStore((s) => s.initialize);
  const setupListeners = useModelStore((s) => s.setupListeners);
  const selectModel = useModelStore((s) => s.selectModel);
  const downloadModel = useModelStore((s) => s.downloadModel);
  const deleteModel = useModelStore((s) => s.deleteModel);

  const availableModels = models.filter((m) => m.is_downloaded);
  const downloadableModels = models.filter((m) => !m.is_downloaded);

  useEffect(() => {
    let cancelled = false;
    initialize();
    let cleanup: (() => void) | undefined;

    setupListeners().then((fn) => {
      if (cancelled) {
        fn();
      } else {
        cleanup = fn;
      }
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [initialize, setupListeners]);

  const handleModelSelect = async (modelId: string) => {
    try {
      await selectModel(modelId);
    } catch (err) {
      console.error("Failed to select model:", err);
    }
  };

  const handleModelDownload = async (modelId: string) => {
    try {
      await downloadModel(modelId);
    } catch (err) {
      console.error("Failed to download model:", err);
    }
  };

  const handleModelDelete = async (modelId: string) => {
    try {
      await deleteModel(modelId);
    } catch (err) {
      console.error("Failed to delete model:", err);
    }
  };

  return (
    <div className="space-y-16">
      {/* Status Header */}
      <div className="space-y-3">
        <h2 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Current Model Status
        </h2>
        <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-3 w-3 rounded-full",
                getStatusColor(modelStatus)
              )}
            />
            <div>
              <p className="font-medium text-sm">
                {getStatusLabel(modelStatus)}
              </p>
              {currentModelId ? (
                <p className="text-muted-foreground text-xs">
                  Current:{" "}
                  {availableModels.find((m) => m.id === currentModelId)?.name ??
                    currentModelId}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Downloaded Models */}
      {availableModels.length > 0 && (
        <div className="space-y-3">
          <h2 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Downloaded Models
          </h2>
          <div className="space-y-2">
            {availableModels.map((model) => (
              <ModelCard
                downloadProgress={undefined}
                downloadSpeed={undefined}
                isActive={model.id === currentModelId}
                isDownloading={false}
                isExtracting={extractingModels.has(model.id)}
                key={model.id}
                model={model}
                onDelete={() => handleModelDelete(model.id)}
                onSelect={() => handleModelSelect(model.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available for Download */}
      {downloadableModels.length > 0 && (
        <div className="space-y-3">
          <h2 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Available for Download
          </h2>
          <div className="space-y-2">
            {downloadableModels.map((model) => {
              const progress = downloadProgress.get(model.id);
              const stats = downloadStats.get(model.id);

              return (
                <ModelCard
                  downloadProgress={progress}
                  downloadSpeed={stats?.speed}
                  isActive={false}
                  isDownloading={downloadProgress.has(model.id)}
                  isExtracting={extractingModels.has(model.id)}
                  key={model.id}
                  model={model}
                  onDelete={noop}
                  onSelect={() => handleModelDownload(model.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {availableModels.length === 0 && downloadableModels.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
          <Download className="h-10 w-10 opacity-40" />
          <div>
            <p className="font-medium">No models available</p>
            <p className="mt-1 text-sm">
              Unable to fetch model information. Please check your connection.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export const ModelsSettings = () => (
  <div className="mx-auto w-full max-w-3xl pb-20">
    <WhisperModelsContent />
  </div>
);
