import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { z } from "zod";
import {
  type DownloadProgress,
  DownloadProgressSchema,
} from "@/features/model-download/download-state";

export const meetingModelId = "meeting-voxtral-realtime";
const MeetingModelStatusSchema = z
  .object({
    download_size_mb: z.number().nonnegative(),
    downloaded: z.boolean(),
    downloading: z.boolean(),
    partial_download_mb: z.number().nonnegative().nullable(),
    supported: z.boolean(),
  })
  .strict();
type MeetingModelStatus = z.infer<typeof MeetingModelStatusSchema>;

const readMeetingModelStatus = async () => {
  const result = await invoke<unknown>("get_meeting_model_status");
  return MeetingModelStatusSchema.parse(result);
};

const withDownload =
  (downloading: boolean) =>
  (status: MeetingModelStatus | null): MeetingModelStatus | null =>
    status && { ...status, downloaded: false, downloading };

interface MeetingModelStatePorts {
  refresh: () => Promise<void>;
  setError: Dispatch<SetStateAction<string | undefined>>;
  setProgress: Dispatch<SetStateAction<DownloadProgress | undefined>>;
  setStatus: Dispatch<SetStateAction<MeetingModelStatus | null>>;
}

const subscribeMeetingModelEvents = async ({
  refresh,
  setError,
  setProgress,
  setStatus,
}: MeetingModelStatePorts) =>
  Promise.all([
    listen<unknown>("model-download-complete", (event) => {
      if (event.payload === meetingModelId) {
        setProgress(undefined);
        refresh().catch((reason) => setError(`${reason}`));
      }
    }),
    listen<unknown>("model-download-progress", (event) => {
      const parsed = DownloadProgressSchema.safeParse(event.payload);
      if (parsed.success && parsed.data.model_id === meetingModelId) {
        setProgress(parsed.data);
        setStatus(withDownload(true));
      }
    }),
    listen<unknown>("model-download-failed", (event) => {
      if (event.payload === meetingModelId) {
        setProgress(undefined);
        setStatus(withDownload(false));
        setError(
          "The meeting transcription model download failed. Retry when you are online."
        );
        refresh().catch((reason) => setError(`${reason}`));
      }
    }),
  ]);

const downloadMeetingModel = async ({
  setError,
  setProgress,
  setStatus,
}: Omit<MeetingModelStatePorts, "refresh">) => {
  setError(undefined);
  setProgress({
    downloaded: 0,
    model_id: meetingModelId,
    percentage: 0,
    total: 0,
  });
  setStatus(withDownload(true));
  try {
    await invoke("download_meeting_model");
    setStatus(await readMeetingModelStatus());
  } catch (reason) {
    setProgress(undefined);
    setStatus(withDownload(false));
    setError(`${reason}`);
  }
};

export const useMeetingModel = () => {
  const [status, setStatus] = useState<MeetingModelStatus | null>(null);
  const [progress, setProgress] = useState<DownloadProgress>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stopped = false;
    const listeners: UnlistenFn[] = [];
    const refresh = async () => {
      const next = await readMeetingModelStatus();
      if (!stopped) {
        setStatus(next);
      }
    };
    const setup = async () => {
      await refresh();
      listeners.push(
        ...(await subscribeMeetingModelEvents({
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
    downloadMeetingModel({ setError, setProgress, setStatus });
  const remove = async () => {
    await invoke("delete_model", { modelId: meetingModelId });
    setStatus(await readMeetingModelStatus());
  };

  return { download, error, progress, remove, status };
};
