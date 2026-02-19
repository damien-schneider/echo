import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ModelInfo } from "@/lib/types";
import DownloadProgressDisplay from "./download-progress-display";
import ModelDropdown from "./model-dropdown";

interface ModelStateEvent {
  event_type: string;
  model_id?: string;
  model_name?: string;
  error?: string;
}

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "extracting"
  | "error"
  | "unloaded"
  | "none";

interface DownloadStats {
  startTime: number;
  lastUpdate: number;
  totalDownloaded: number;
  speed: number;
}

interface ModelSelectorProps {
  onError?: (error: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onError }) => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string>("");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("unloaded");
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<
    Map<string, DownloadProgress>
  >(new Map());
  const [downloadStats, setDownloadStats] = useState<
    Map<string, DownloadStats>
  >(new Map());
  const [extractingModels, setExtractingModels] = useState<Set<string>>(
    new Set()
  );

  const loadModels = useCallback(async () => {
    try {
      const modelList = await invoke<ModelInfo[]>("get_available_models");
      setModels(modelList);
    } catch (err) {
      console.error("Failed to load models:", err);
    }
  }, []);

  const loadCurrentModel = useCallback(async () => {
    try {
      const current = await invoke<string>("get_current_model");
      setCurrentModelId(current);

      if (current) {
        // Check if model is actually loaded
        const transcriptionStatus = await invoke<string | null>(
          "get_transcription_model_status"
        );
        if (transcriptionStatus === current) {
          setModelStatus("ready");
        } else {
          setModelStatus("unloaded");
        }
      } else {
        setModelStatus("none");
      }
    } catch (err) {
      console.error("Failed to load current model:", err);
      setModelStatus("error");
      setModelError("Failed to check model status");
    }
  }, []);

  const handleModelSelect = useCallback(
    async (modelId: string) => {
      try {
        setModelError(null);
        await invoke("set_active_model", { modelId });
        setCurrentModelId(modelId);
      } catch (err) {
        const errorMsg = `${err}`;
        setModelError(errorMsg);
        setModelStatus("error");
        onError?.(errorMsg);
      }
    },
    [onError]
  );

  useEffect(() => {
    loadModels();
    loadCurrentModel();

    // Listen for model state changes
    const modelStateUnlisten = listen<ModelStateEvent>(
      "model-state-changed",
      (event) => {
        const { event_type, model_id, error } = event.payload;

        switch (event_type) {
          case "loading_started":
            setModelStatus("loading");
            setModelError(null);
            break;
          case "loading_completed":
            setModelStatus("ready");
            setModelError(null);
            if (model_id) {
              setCurrentModelId(model_id);
            }
            break;
          case "loading_failed":
            setModelStatus("error");
            setModelError(error || "Failed to load model");
            break;
          case "unloaded":
            setModelStatus("unloaded");
            setModelError(null);
            break;
          default:
            break;
        }
      }
    );

    // Listen for model download progress
    const downloadProgressUnlisten = listen<DownloadProgress>(
      "model-download-progress",
      (event) => {
        const progress = event.payload;
        setModelDownloadProgress((prev) => {
          const newMap = new Map(prev);
          newMap.set(progress.model_id, progress);
          return newMap;
        });
        setModelStatus("downloading");

        // Update download stats for speed calculation
        const now = Date.now();
        setDownloadStats((prev) => {
          const current = prev.get(progress.model_id);
          const newStats = new Map(prev);

          if (current) {
            // Calculate speed over last few seconds
            const timeDiff = (now - current.lastUpdate) / 1000; // seconds
            const bytesDiff = progress.downloaded - current.totalDownloaded;

            if (timeDiff > 0.5) {
              // Update speed every 500ms
              const currentSpeed = bytesDiff / (1024 * 1024) / timeDiff; // MB/s
              // Smooth the speed with exponential moving average, but ensure positive values
              const validCurrentSpeed = Math.max(0, currentSpeed);
              const smoothedSpeed =
                current.speed > 0
                  ? current.speed * 0.8 + validCurrentSpeed * 0.2
                  : validCurrentSpeed;

              newStats.set(progress.model_id, {
                startTime: current.startTime,
                lastUpdate: now,
                totalDownloaded: progress.downloaded,
                speed: Math.max(0, smoothedSpeed),
              });
            }
          } else {
            // First progress update - initialize
            newStats.set(progress.model_id, {
              startTime: now,
              lastUpdate: now,
              totalDownloaded: progress.downloaded,
              speed: 0,
            });
          }

          return newStats;
        });
      }
    );

    // Listen for model download completion
    const downloadCompleteUnlisten = listen<string>(
      "model-download-complete",
      (event) => {
        const modelId = event.payload;
        setModelDownloadProgress((prev) => {
          const newMap = new Map(prev);
          newMap.delete(modelId);
          return newMap;
        });
        setDownloadStats((prev) => {
          const newStats = new Map(prev);
          newStats.delete(modelId);
          return newStats;
        });
        loadModels(); // Refresh models list

        // Auto-select the newly downloaded model
        setTimeout(() => {
          loadCurrentModel();
          handleModelSelect(modelId);
        }, 500);
      }
    );

    // Listen for extraction events
    const extractionStartedUnlisten = listen<string>(
      "model-extraction-started",
      (event) => {
        const modelId = event.payload;
        setExtractingModels((prev) => new Set(prev.add(modelId)));
        setModelStatus("extracting");
      }
    );

    const extractionCompletedUnlisten = listen<string>(
      "model-extraction-completed",
      (event) => {
        const modelId = event.payload;
        setExtractingModels((prev) => {
          const next = new Set(prev);
          next.delete(modelId);
          return next;
        });
        loadModels(); // Refresh models list

        // Auto-select the newly extracted model
        setTimeout(() => {
          loadCurrentModel();
          handleModelSelect(modelId);
        }, 500);
      }
    );

    const extractionFailedUnlisten = listen<{
      model_id: string;
      error: string;
    }>("model-extraction-failed", (event) => {
      const modelId = event.payload.model_id;
      setExtractingModels((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
      setModelError(`Failed to extract model: ${event.payload.error}`);
      setModelStatus("error");
    });

    return () => {
      modelStateUnlisten.then((fn) => fn());
      downloadProgressUnlisten.then((fn) => fn());
      downloadCompleteUnlisten.then((fn) => fn());
      extractionStartedUnlisten.then((fn) => fn());
      extractionCompletedUnlisten.then((fn) => fn());
      extractionFailedUnlisten.then((fn) => fn());
    };
  }, [handleModelSelect, loadCurrentModel, loadModels]);

  const getExtractingText = (): string | null => {
    if (extractingModels.size === 0) {
      return null;
    }
    if (extractingModels.size === 1) {
      const [modelId] = Array.from(extractingModels);
      const model = models.find((m) => m.id === modelId);
      return `Extracting ${model?.name || "Model"}...`;
    }
    return `Extracting ${extractingModels.size} models...`;
  };

  const getDownloadingText = (): string | null => {
    if (modelDownloadProgress.size === 0) {
      return null;
    }
    if (modelDownloadProgress.size === 1) {
      const [progress] = Array.from(modelDownloadProgress.values());
      const percentage = Math.max(
        0,
        Math.min(100, Math.round(progress.percentage))
      );
      return `Downloading ${percentage}%`;
    }
    return `Downloading ${modelDownloadProgress.size} models...`;
  };

  const handleModelDownload = async (modelId: string) => {
    try {
      setModelError(null);
      await invoke("download_model", { modelId });
    } catch (err) {
      const errorMsg = `${err}`;
      setModelError(errorMsg);
      setModelStatus("error");
      onError?.(errorMsg);
    }
  };

  const getCurrentModel = () => models.find((m) => m.id === currentModelId);

  const getModelDisplayText = (): string => {
    const extractingText = getExtractingText();
    if (extractingText) {
      return extractingText;
    }

    const downloadingText = getDownloadingText();
    if (downloadingText) {
      return downloadingText;
    }

    const currentModel = getCurrentModel();

    switch (modelStatus) {
      case "ready":
        return currentModel?.name || "Model Ready";
      case "loading":
        return currentModel ? `Loading ${currentModel.name}...` : "Loading...";
      case "extracting":
        return currentModel
          ? `Extracting ${currentModel.name}...`
          : "Extracting...";
      case "error":
        return modelError || "Model Error";
      case "unloaded":
        return currentModel?.name || "Model Unloaded";
      case "none":
        return "No Model - Download Required";
      default:
        return currentModel?.name || "Model Unloaded";
    }
  };

  const handleModelDelete = async (modelId: string) => {
    await invoke("delete_model", { modelId });
    await loadModels();
    setModelError(null);
  };

  return (
    <>
      {/* Model Status and Switcher */}
      <div className="relative">
        <ModelDropdown
          currentModelId={currentModelId}
          displayText={getModelDisplayText()}
          downloadProgress={modelDownloadProgress}
          models={models}
          onError={onError}
          onModelDelete={handleModelDelete}
          onModelDownload={handleModelDownload}
          onModelSelect={handleModelSelect}
          status={modelStatus}
        />
      </div>

      {/* Download Progress Bar for Models */}
      <DownloadProgressDisplay
        downloadProgress={modelDownloadProgress}
        downloadStats={downloadStats}
      />
    </>
  );
};

export default ModelSelector;
