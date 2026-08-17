import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";
import { create } from "zustand";
import {
  clearDownloadFailure,
  type DownloadProgress,
  DownloadProgressSchema,
  type DownloadStats,
} from "@/features/model-download/download-state";
import {
  type TranscriptionModelSize,
  TranscriptionModelSizeSchema,
  type TranscriptionProfileStatus,
  TranscriptionProfileStatusSchema,
} from "@/lib/types";
export type ModelStatus =
  | "ready"
  | "loading"
  | "downloading"
  | "error"
  | "unloaded"
  | "none";

const ModelStateEventSchema = z.object({
  error: z.string().optional(),
  event_type: z.string(),
  model_id: z.string().optional(),
});

const isTranscriptionModelId = (modelId: string) =>
  TranscriptionModelSizeSchema.safeParse(modelId).success;

interface ModelStore {
  deleteProfile: (size: TranscriptionModelSize) => Promise<void>;
  downloadProgress: Map<string, DownloadProgress>;
  downloadStats: Map<string, DownloadStats>;
  error: string | null;
  initialize: () => Promise<void>;
  loadProfiles: () => Promise<void>;
  modelStatus: ModelStatus;
  profiles: TranscriptionProfileStatus[];
  selectProfile: (size: TranscriptionModelSize) => Promise<void>;
  setupListeners: () => Promise<() => void>;
}

const loadProfilePayload = async () => {
  const payload = await invoke<unknown>("get_transcription_profiles");
  return TranscriptionProfileStatusSchema.array().parse(payload);
};

export const useModelStore = create<ModelStore>((set, get) => ({
  deleteProfile: async (size) => {
    set({ error: null });
    try {
      await invoke("delete_model", { modelId: size });
      await get().loadProfiles();
    } catch (error) {
      set({ error: `${error}` });
      throw error;
    }
  },
  downloadProgress: new Map(),
  downloadStats: new Map(),
  error: null,

  initialize: async () => {
    await get().loadProfiles();
    try {
      const loadedModel = await invoke<string | null>(
        "get_transcription_model_status"
      );
      const active = get().profiles.find((profile) => profile.is_active);
      if (!active?.is_downloaded) {
        set({ modelStatus: "none" });
      } else if (loadedModel === active.size) {
        set({ modelStatus: "ready" });
      } else {
        set({ modelStatus: "unloaded" });
      }
    } catch (error) {
      set({
        error: `Failed to read transcription status: ${error}`,
        modelStatus: "error",
      });
    }
  },

  loadProfiles: async () => {
    try {
      const profiles = await loadProfilePayload();
      set({ error: null, profiles });
    } catch (error) {
      set({ error: `Failed to load transcription profiles: ${error}` });
    }
  },
  modelStatus: "unloaded",
  profiles: [],

  selectProfile: async (size) => {
    const profile = get().profiles.find((candidate) => candidate.size === size);
    set({
      error: null,
      modelStatus: profile?.is_downloaded ? "loading" : "downloading",
    });
    try {
      await invoke("select_transcription_model_size", { size });
      await get().loadProfiles();
      set({ modelStatus: "ready" });
    } catch (error) {
      set((state) => {
        const cleared = clearDownloadFailure({
          modelId: size,
          progress: state.downloadProgress,
          stats: state.downloadStats,
        });
        return {
          downloadProgress: cleared.progress,
          downloadStats: cleared.stats,
          error: `${error}`,
          modelStatus: "error",
        };
      });
      throw error;
    }
  },

  setupListeners: async () => {
    const listeners: UnlistenFn[] = [];

    listeners.push(
      await listen<unknown>("model-state-changed", (event) => {
        const parsed = ModelStateEventSchema.safeParse(event.payload);
        if (!parsed.success) {
          return;
        }
        switch (parsed.data.event_type) {
          case "loading_started":
            set({ error: null, modelStatus: "loading" });
            break;
          case "loading_completed":
            set({ error: null, modelStatus: "ready" });
            break;
          case "loading_failed":
            set({
              error: parsed.data.error ?? "Failed to load transcription model",
              modelStatus: "error",
            });
            break;
          case "unloaded":
            set({ error: null, modelStatus: "unloaded" });
            break;
          default:
            break;
        }
      })
    );

    listeners.push(
      await listen<unknown>("model-download-progress", (event) => {
        const parsed = DownloadProgressSchema.safeParse(event.payload);
        if (!parsed.success) {
          return;
        }
        const progress = parsed.data;
        if (!isTranscriptionModelId(progress.model_id)) {
          return;
        }
        const now = Date.now();
        set((state) => {
          const downloadProgress = new Map(state.downloadProgress);
          downloadProgress.set(progress.model_id, progress);
          const downloadStats = new Map(state.downloadStats);
          const current = downloadStats.get(progress.model_id);
          if (current) {
            const elapsedSeconds = (now - current.lastUpdate) / 1000;
            if (elapsedSeconds > 0.5) {
              const instantSpeed =
                (progress.downloaded - current.totalDownloaded) /
                (1024 * 1024) /
                elapsedSeconds;
              downloadStats.set(progress.model_id, {
                lastUpdate: now,
                speed:
                  current.speed > 0
                    ? current.speed * 0.8 + Math.max(0, instantSpeed) * 0.2
                    : Math.max(0, instantSpeed),
                totalDownloaded: progress.downloaded,
              });
            }
          } else {
            downloadStats.set(progress.model_id, {
              lastUpdate: now,
              speed: 0,
              totalDownloaded: progress.downloaded,
            });
          }
          return {
            downloadProgress,
            downloadStats,
            modelStatus: "downloading",
          };
        });
      })
    );

    listeners.push(
      await listen<string>("model-download-complete", async (event) => {
        if (!isTranscriptionModelId(event.payload)) {
          return;
        }
        set((state) => {
          const downloadProgress = new Map(state.downloadProgress);
          downloadProgress.delete(event.payload);
          const downloadStats = new Map(state.downloadStats);
          downloadStats.delete(event.payload);
          return { downloadProgress, downloadStats };
        });
        await get().loadProfiles();
      })
    );

    listeners.push(
      await listen<unknown>("model-download-failed", (event) => {
        const parsed = z.string().safeParse(event.payload);
        if (!(parsed.success && isTranscriptionModelId(parsed.data))) {
          return;
        }
        set((state) => {
          const cleared = clearDownloadFailure({
            modelId: parsed.data,
            progress: state.downloadProgress,
            stats: state.downloadStats,
          });
          return {
            downloadProgress: cleared.progress,
            downloadStats: cleared.stats,
            error:
              "The model download failed. Check your connection and retry.",
            modelStatus: "error",
          };
        });
      })
    );

    return () => {
      for (const unlisten of listeners) {
        unlisten();
      }
    };
  },
}));
