import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { atom } from "jotai";
import type { ModelInfo } from "@/lib/types";

// Types
export type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "extracting"
  | "error"
  | "unloaded"
  | "none";

type ModelStateEvent = {
  event_type: string;
  model_id?: string;
  model_name?: string;
  error?: string;
};

type DownloadProgress = {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
};

type DownloadStats = {
  startTime: number;
  lastUpdate: number;
  totalDownloaded: number;
  speed: number;
};

// State Atoms
export const modelsAtom = atom<ModelInfo[]>([]);
export const currentModelIdAtom = atom<string>("");
export const modelStatusAtom = atom<ModelStatus>("unloaded");
export const modelErrorAtom = atom<string | null>(null);
export const downloadProgressAtom = atom<Map<string, DownloadProgress>>(
  new Map()
);
export const downloadStatsAtom = atom<Map<string, DownloadStats>>(new Map());
export const extractingModelsAtom = atom<Set<string>>(new Set<string>());

// Derived Atoms
export const currentModelAtom = atom((get) => {
  const models = get(modelsAtom);
  const currentId = get(currentModelIdAtom);
  return models.find((m) => m.id === currentId);
});

export const availableModelsAtom = atom((get) => {
  const models = get(modelsAtom);
  return models.filter((m) => m.is_downloaded);
});

export const downloadableModelsAtom = atom((get) => {
  const models = get(modelsAtom);
  return models.filter((m) => !m.is_downloaded);
});

export const modelDisplayTextAtom = atom((get) => {
  const extractingModels = get(extractingModelsAtom);
  const downloadProgress = get(downloadProgressAtom);
  const modelStatus = get(modelStatusAtom);
  const currentModel = get(currentModelAtom);
  const modelError = get(modelErrorAtom);
  const models = get(modelsAtom);

  if (extractingModels.size > 0) {
    if (extractingModels.size === 1) {
      const [modelId] = Array.from(extractingModels);
      const model = models.find((m) => m.id === modelId);
      return `Extracting ${model?.name ?? "Model"}...`;
    }
    return `Extracting ${extractingModels.size} models...`;
  }

  if (downloadProgress.size > 0) {
    if (downloadProgress.size === 1) {
      const [progress] = Array.from(downloadProgress.values());
      const percentage = Math.max(
        0,
        Math.min(100, Math.round(progress.percentage))
      );
      return `Downloading ${percentage}%`;
    }
    return `Downloading ${downloadProgress.size} models...`;
  }

  return getStatusText(modelStatus, currentModel, modelError);
});

const getStatusText = (
  status: ModelStatus,
  currentModel: ModelInfo | undefined,
  modelError: string | null
): string => {
  switch (status) {
    case "ready":
      return currentModel?.name ?? "Model Ready";
    case "loading":
      return currentModel ? `Loading ${currentModel.name}...` : "Loading...";
    case "extracting":
      return currentModel
        ? `Extracting ${currentModel.name}...`
        : "Extracting...";
    case "error":
      return modelError ?? "Model Error";
    case "unloaded":
      return currentModel?.name ?? "Model Unloaded";
    case "none":
      return "No Model - Download Required";
    default:
      return currentModel?.name ?? "Model Unloaded";
  }
};

// Action Atoms
export const loadModelsAtom = atom(null, async (_get, set) => {
  try {
    const modelList = await invoke<ModelInfo[]>("get_available_models");
    set(modelsAtom, modelList);
  } catch (err) {
    console.error("Failed to load models:", err);
  }
});

export const loadCurrentModelAtom = atom(null, async (_get, set) => {
  try {
    const current = await invoke<string>("get_current_model");
    set(currentModelIdAtom, current);

    if (current) {
      const transcriptionStatus = await invoke<string | null>(
        "get_transcription_model_status"
      );
      if (transcriptionStatus === current) {
        set(modelStatusAtom, "ready");
      } else {
        set(modelStatusAtom, "unloaded");
      }
    } else {
      set(modelStatusAtom, "none");
    }
  } catch (err) {
    console.error("Failed to load current model:", err);
    set(modelStatusAtom, "error");
    set(modelErrorAtom, "Failed to check model status");
  }
});

export const selectModelAtom = atom(
  null,
  async (_get, set, modelId: string) => {
    try {
      set(modelErrorAtom, null);
      await invoke("set_active_model", { modelId });
      set(currentModelIdAtom, modelId);
    } catch (err) {
      const errorMsg = `${err}`;
      set(modelErrorAtom, errorMsg);
      set(modelStatusAtom, "error");
      throw err;
    }
  }
);

export const downloadModelAtom = atom(
  null,
  async (_get, set, modelId: string) => {
    try {
      set(modelErrorAtom, null);
      await invoke("download_model", { modelId });
    } catch (err) {
      const errorMsg = `${err}`;
      set(modelErrorAtom, errorMsg);
      set(modelStatusAtom, "error");
      throw err;
    }
  }
);

export const deleteModelAtom = atom(
  null,
  async (_get, set, modelId: string) => {
    try {
      await invoke("delete_model", { modelId });
      set(modelErrorAtom, null);
      // Refresh models list
      const modelList = await invoke<ModelInfo[]>("get_available_models");
      set(modelsAtom, modelList);
    } catch (err) {
      const errorMsg = `${err}`;
      set(modelErrorAtom, errorMsg);
      throw err;
    }
  }
);

export const initializeModelsAtom = atom(null, async (_get, set) => {
  await Promise.all([set(loadModelsAtom), set(loadCurrentModelAtom)]);
});

// Event listener setup - call this once at app root
export const setupModelListenersAtom = atom(null, async (_get, set) => {
  const listeners: UnlistenFn[] = [];

  // Model state changes
  const modelStateUnlisten = await listen<ModelStateEvent>(
    "model-state-changed",
    (event) => {
      const { event_type, model_id, error } = event.payload;

      switch (event_type) {
        case "loading_started":
          set(modelStatusAtom, "loading");
          set(modelErrorAtom, null);
          break;
        case "loading_completed":
          set(modelStatusAtom, "ready");
          set(modelErrorAtom, null);
          if (model_id) {
            set(currentModelIdAtom, model_id);
          }
          break;
        case "loading_failed":
          set(modelStatusAtom, "error");
          set(modelErrorAtom, error ?? "Failed to load model");
          break;
        case "unloaded":
          set(modelStatusAtom, "unloaded");
          set(modelErrorAtom, null);
          break;
        default:
          break;
      }
    }
  );
  listeners.push(modelStateUnlisten);

  // Download progress
  const downloadProgressUnlisten = await listen<DownloadProgress>(
    "model-download-progress",
    (event) => {
      const progress = event.payload;
      set(downloadProgressAtom, (prev) => {
        const newMap = new Map(prev);
        newMap.set(progress.model_id, progress);
        return newMap;
      });
      set(modelStatusAtom, "downloading");

      // Update download stats for speed calculation
      const now = Date.now();
      set(downloadStatsAtom, (prev) => {
        const current = prev.get(progress.model_id);
        const newStats = new Map(prev);

        if (current) {
          const timeDiff = (now - current.lastUpdate) / 1000;
          const bytesDiff = progress.downloaded - current.totalDownloaded;

          if (timeDiff > 0.5) {
            const currentSpeed = bytesDiff / (1024 * 1024) / timeDiff;
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
  listeners.push(downloadProgressUnlisten);

  // Download complete
  const downloadCompleteUnlisten = await listen<string>(
    "model-download-complete",
    async (event) => {
      const modelId = event.payload;
      set(downloadProgressAtom, (prev) => {
        const newMap = new Map(prev);
        newMap.delete(modelId);
        return newMap;
      });
      set(downloadStatsAtom, (prev) => {
        const newStats = new Map(prev);
        newStats.delete(modelId);
        return newStats;
      });

      // Refresh models list and auto-select
      await set(loadModelsAtom);
      setTimeout(async () => {
        await set(loadCurrentModelAtom);
        await set(selectModelAtom, modelId);
      }, 500);
    }
  );
  listeners.push(downloadCompleteUnlisten);

  // Extraction started
  const extractionStartedUnlisten = await listen<string>(
    "model-extraction-started",
    (event) => {
      const modelId = event.payload;
      set(extractingModelsAtom, (prev: Set<string>) =>
        new Set(prev).add(modelId)
      );
      set(modelStatusAtom, "extracting");
    }
  );
  listeners.push(extractionStartedUnlisten);

  // Extraction completed
  const extractionCompletedUnlisten = await listen<string>(
    "model-extraction-completed",
    async (event) => {
      const modelId = event.payload;
      set(extractingModelsAtom, (prev: Set<string>) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });

      // Refresh models list and auto-select
      await set(loadModelsAtom);
      setTimeout(async () => {
        await set(loadCurrentModelAtom);
        await set(selectModelAtom, modelId);
      }, 500);
    }
  );
  listeners.push(extractionCompletedUnlisten);

  // Extraction failed
  const extractionFailedUnlisten = await listen<{
    model_id: string;
    error: string;
  }>("model-extraction-failed", (event) => {
    const modelId = event.payload.model_id;
    set(extractingModelsAtom, (prev: Set<string>) => {
      const next = new Set(prev);
      next.delete(modelId);
      return next;
    });
    set(modelErrorAtom, `Failed to extract model: ${event.payload.error}`);
    set(modelStatusAtom, "error");
  });
  listeners.push(extractionFailedUnlisten);

  // Return cleanup function
  return () => {
    for (const unlisten of listeners) {
      unlisten();
    }
  };
});
