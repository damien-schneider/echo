import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { ModelInfo } from "@/lib/types";

export type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "extracting"
  | "error"
  | "unloaded"
  | "none";

interface ModelStateEvent {
  error?: string;
  event_type: string;
  model_id?: string;
  model_name?: string;
}

interface DownloadProgress {
  downloaded: number;
  model_id: string;
  percentage: number;
  total: number;
}

interface DownloadStats {
  lastUpdate: number;
  speed: number;
  startTime: number;
  totalDownloaded: number;
}

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

interface ModelStore {
  currentModelId: string;
  deleteModel: (modelId: string) => Promise<void>;
  downloadModel: (modelId: string) => Promise<void>;
  downloadProgress: Map<string, DownloadProgress>;
  downloadStats: Map<string, DownloadStats>;
  extractingModels: Set<string>;
  getModelDisplayText: () => string;
  initialize: () => Promise<void>;
  loadCurrentModel: () => Promise<void>;

  loadModels: () => Promise<void>;
  modelError: string | null;
  modelStatus: ModelStatus;
  models: ModelInfo[];
  selectModel: (modelId: string) => Promise<void>;
  setupListeners: () => Promise<() => void>;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  currentModelId: "",
  modelStatus: "unloaded",
  modelError: null,
  downloadProgress: new Map(),
  downloadStats: new Map(),
  extractingModels: new Set(),

  loadModels: async () => {
    try {
      const modelList = await invoke<ModelInfo[]>("get_available_models");
      set({ models: modelList });
    } catch (err) {
      console.error("Failed to load models:", err);
    }
  },

  loadCurrentModel: async () => {
    try {
      const current = await invoke<string>("get_current_model");
      set({ currentModelId: current });

      if (current) {
        const transcriptionStatus = await invoke<string | null>(
          "get_transcription_model_status"
        );
        if (transcriptionStatus === current) {
          set({ modelStatus: "ready" });
        } else {
          set({ modelStatus: "unloaded" });
        }
      } else {
        set({ modelStatus: "none" });
      }
    } catch (err) {
      console.error("Failed to load current model:", err);
      set({
        modelStatus: "error",
        modelError: "Failed to check model status",
      });
    }
  },

  selectModel: async (modelId) => {
    try {
      set({ modelError: null });
      await invoke("set_active_model", { modelId });
      set({ currentModelId: modelId });
    } catch (err) {
      const errorMsg = `${err}`;
      set({ modelError: errorMsg, modelStatus: "error" });
      throw err;
    }
  },

  downloadModel: async (modelId) => {
    try {
      set({ modelError: null });
      await invoke("download_model", { modelId });
    } catch (err) {
      const errorMsg = `${err}`;
      set({ modelError: errorMsg, modelStatus: "error" });
      throw err;
    }
  },

  deleteModel: async (modelId) => {
    try {
      await invoke("delete_model", { modelId });
      set({ modelError: null });
      const modelList = await invoke<ModelInfo[]>("get_available_models");
      set({ models: modelList });
    } catch (err) {
      const errorMsg = `${err}`;
      set({ modelError: errorMsg });
      throw err;
    }
  },

  initialize: async () => {
    const { loadModels, loadCurrentModel } = get();
    await Promise.all([loadModels(), loadCurrentModel()]);
  },

  setupListeners: async () => {
    const listeners: UnlistenFn[] = [];

    const modelStateUnlisten = await listen<ModelStateEvent>(
      "model-state-changed",
      (event) => {
        const { event_type, model_id, error } = event.payload;

        switch (event_type) {
          case "loading_started":
            set({ modelStatus: "loading", modelError: null });
            break;
          case "loading_completed":
            set({
              modelStatus: "ready",
              modelError: null,
              ...(model_id ? { currentModelId: model_id } : {}),
            });
            break;
          case "loading_failed":
            set({
              modelStatus: "error",
              modelError: error ?? "Failed to load model",
            });
            break;
          case "unloaded":
            set({ modelStatus: "unloaded", modelError: null });
            break;
          default:
            break;
        }
      }
    );
    listeners.push(modelStateUnlisten);

    const downloadProgressUnlisten = await listen<DownloadProgress>(
      "model-download-progress",
      (event) => {
        const progress = event.payload;
        const now = Date.now();

        // Single set() call for both progress and stats to avoid double renders
        set((state) => {
          const newProgress = new Map(state.downloadProgress);
          newProgress.set(progress.model_id, progress);

          const current = state.downloadStats.get(progress.model_id);

          // Only copy stats map when we actually need to update it
          if (!current) {
            const newStats = new Map(state.downloadStats);
            newStats.set(progress.model_id, {
              startTime: now,
              lastUpdate: now,
              totalDownloaded: progress.downloaded,
              speed: 0,
            });
            return {
              downloadProgress: newProgress,
              downloadStats: newStats,
              modelStatus: "downloading" as const,
            };
          }

          const timeDiff = (now - current.lastUpdate) / 1000;
          if (timeDiff > 0.5) {
            const bytesDiff = progress.downloaded - current.totalDownloaded;
            const currentSpeed = bytesDiff / (1024 * 1024) / timeDiff;
            const validCurrentSpeed = Math.max(0, currentSpeed);
            const smoothedSpeed =
              current.speed > 0
                ? current.speed * 0.8 + validCurrentSpeed * 0.2
                : validCurrentSpeed;

            const newStats = new Map(state.downloadStats);
            newStats.set(progress.model_id, {
              startTime: current.startTime,
              lastUpdate: now,
              totalDownloaded: progress.downloaded,
              speed: Math.max(0, smoothedSpeed),
            });
            return {
              downloadProgress: newProgress,
              downloadStats: newStats,
              modelStatus: "downloading" as const,
            };
          }

          // Stats unchanged — don't copy the map
          return {
            downloadProgress: newProgress,
            modelStatus: "downloading" as const,
          };
        });
      }
    );
    listeners.push(downloadProgressUnlisten);

    const downloadCompleteUnlisten = await listen<string>(
      "model-download-complete",
      async (event) => {
        const modelId = event.payload;
        set((state) => {
          const newProgress = new Map(state.downloadProgress);
          newProgress.delete(modelId);
          const newStats = new Map(state.downloadStats);
          newStats.delete(modelId);
          return { downloadProgress: newProgress, downloadStats: newStats };
        });

        await get().loadModels();
        setTimeout(async () => {
          await get().loadCurrentModel();
          await get().selectModel(modelId);
        }, 500);
      }
    );
    listeners.push(downloadCompleteUnlisten);

    const extractionStartedUnlisten = await listen<string>(
      "model-extraction-started",
      (event) => {
        const modelId = event.payload;
        set((state) => ({
          extractingModels: new Set(state.extractingModels).add(modelId),
          modelStatus: "extracting",
        }));
      }
    );
    listeners.push(extractionStartedUnlisten);

    const extractionCompletedUnlisten = await listen<string>(
      "model-extraction-completed",
      async (event) => {
        const modelId = event.payload;
        set((state) => {
          const next = new Set(state.extractingModels);
          next.delete(modelId);
          return { extractingModels: next };
        });

        await get().loadModels();
        setTimeout(async () => {
          await get().loadCurrentModel();
          await get().selectModel(modelId);
        }, 500);
      }
    );
    listeners.push(extractionCompletedUnlisten);

    const extractionFailedUnlisten = await listen<{
      model_id: string;
      error: string;
    }>("model-extraction-failed", (event) => {
      const modelId = event.payload.model_id;
      set((state) => {
        const next = new Set(state.extractingModels);
        next.delete(modelId);
        return {
          extractingModels: next,
          modelError: `Failed to extract model: ${event.payload.error}`,
          modelStatus: "error" as const,
        };
      });
    });
    listeners.push(extractionFailedUnlisten);

    return () => {
      for (const unlisten of listeners) {
        unlisten();
      }
    };
  },

  getModelDisplayText: () => {
    const {
      extractingModels,
      downloadProgress,
      modelStatus,
      currentModelId,
      modelError,
      models,
    } = get();

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
        const progress = Array.from(downloadProgress.values())[0];
        if (!progress) {
          return "Downloading...";
        }
        const percentage = Math.max(
          0,
          Math.min(100, Math.round(progress.percentage))
        );
        return `Downloading ${percentage}%`;
      }
      return `Downloading ${downloadProgress.size} models...`;
    }

    const currentModel = models.find((m) => m.id === currentModelId);
    return getStatusText(modelStatus, currentModel, modelError);
  },
}));
