import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { z } from "zod";
import {
  type DownloadProgress,
  DownloadProgressSchema,
} from "@/features/model-download/download-state";

const diarizationModelId = "diarization-sortformer";
const DiarizationStatusSchema = z
  .object({
    downloaded: z.boolean(),
    downloading: z.boolean(),
  })
  .strict();
type DiarizationStatus = z.infer<typeof DiarizationStatusSchema>;

const readDiarizationStatus = async () => {
  const result = await invoke<unknown>("get_diarization_status");
  return DiarizationStatusSchema.parse(result);
};

interface DiarizationStatePorts {
  refresh: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | undefined>>;
  setProgress: Dispatch<SetStateAction<DownloadProgress | undefined>>;
  setStatus: Dispatch<SetStateAction<DiarizationStatus | null>>;
}

const subscribeDiarizationEvents = async ({
  refresh,
  setError,
  setProgress,
  setStatus,
}: DiarizationStatePorts) =>
  Promise.all([
    listen<unknown>("model-download-complete", (event) => {
      if (event.payload === diarizationModelId) {
        setProgress(undefined);
        refresh().catch((reason) => setError(`${reason}`));
      }
    }),
    listen<unknown>("model-download-progress", (event) => {
      const parsed = DownloadProgressSchema.safeParse(event.payload);
      if (parsed.success && parsed.data.model_id === diarizationModelId) {
        setProgress(parsed.data);
        setStatus({ downloaded: false, downloading: true });
      }
    }),
    listen<unknown>("model-download-failed", (event) => {
      if (event.payload === diarizationModelId) {
        setProgress(undefined);
        setStatus({ downloaded: false, downloading: false });
        setError(
          "The speaker detection model download failed. Retry when you are online."
        );
      }
    }),
  ]);

const downloadDiarizationModel = async ({
  setError,
  setProgress,
  setStatus,
}: Omit<DiarizationStatePorts, "refresh">) => {
  setError(undefined);
  setProgress({
    downloaded: 0,
    model_id: diarizationModelId,
    percentage: 0,
    total: 0,
  });
  setStatus({ downloaded: false, downloading: true });
  try {
    await invoke("download_diarization_model");
    setStatus(await readDiarizationStatus());
  } catch (reason) {
    setProgress(undefined);
    setStatus({ downloaded: false, downloading: false });
    setError(`${reason}`);
  }
};

export const useDiarizationModel = () => {
  const [status, setStatus] = useState<DiarizationStatus | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stopped = false;
    const listeners: UnlistenFn[] = [];
    const refresh = async () => {
      const next = await readDiarizationStatus();
      if (!stopped) {
        setStatus(next);
      }
    };
    const setup = async () => {
      await refresh();
      listeners.push(
        ...(await subscribeDiarizationEvents({
          refresh,
          setError,
          setProgress,
          setStatus,
        }))
      );
    };
    setup().catch((reason) => setError(`${reason}`));
    return () => {
      stopped = true;
      for (const unlisten of listeners) {
        unlisten();
      }
    };
  }, []);

  const download = () =>
    downloadDiarizationModel({ setError, setProgress, setStatus });

  return { download, error, progress, status };
};
