import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { subscribeEventListeners } from "@/features/overlay-controls/runtime/event-subscription";
import {
  acceptPolishModelStatus,
  createPolishModelSession,
  type createPolishStatusSynchronizer,
  handlePolishDownloadComplete,
  handlePolishDownloadProgress,
  handlePolishVerificationProgress,
  initialPolishModelStatus,
  isPolishModelEvent,
  type PolishModelProgress,
  polishModelFailure,
  runPolishModelCommand,
} from "@/features/polish/polish-model-state";
import { type PolishStatus, PolishStatusSchema } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

interface PolishModelPorts {
  isStopped: () => boolean;
  setProgress: Dispatch<SetStateAction<PolishModelProgress | undefined>>;
  statusSynchronizer: ReturnType<typeof createPolishStatusSynchronizer>;
}

const registerPolishStatus = (ports: PolishModelPorts) =>
  listen<unknown>("polish-status-changed", (event) => {
    const parsed = PolishStatusSchema.safeParse(event.payload);
    if (!ports.isStopped() && parsed.success) {
      acceptPolishModelStatus({
        setProgress: ports.setProgress,
        status: parsed.data,
        statusSynchronizer: ports.statusSynchronizer,
      });
    }
  });

const registerDownloadComplete = (ports: PolishModelPorts) =>
  listen<unknown>("model-download-complete", (event) => {
    if (!ports.isStopped()) {
      handlePolishDownloadComplete({
        modelId: ports.statusSynchronizer.currentModelId(),
        payload: event.payload,
        refreshStatus: ports.statusSynchronizer.requestRefresh,
        setProgress: ports.setProgress,
      });
    }
  });

const registerDownloadFailure = (ports: PolishModelPorts) =>
  listen<unknown>("model-download-failed", (event) => {
    if (
      !ports.isStopped() &&
      isPolishModelEvent(
        event.payload,
        ports.statusSynchronizer.currentModelId()
      )
    ) {
      acceptPolishModelStatus({
        setProgress: ports.setProgress,
        status: polishModelFailure("download"),
        statusSynchronizer: ports.statusSynchronizer,
      });
    }
  });

const registerDownloadProgress = (ports: PolishModelPorts) =>
  listen<unknown>("model-download-progress", (event) => {
    if (!ports.isStopped()) {
      handlePolishDownloadProgress({
        modelId: ports.statusSynchronizer.currentModelId(),
        payload: event.payload,
        setProgress: ports.setProgress,
        statusSynchronizer: ports.statusSynchronizer,
      });
    }
  });

const registerVerificationStart = (ports: PolishModelPorts) =>
  listen<unknown>("model-verification-started", (event) => {
    if (
      !ports.isStopped() &&
      isPolishModelEvent(
        event.payload,
        ports.statusSynchronizer.currentModelId()
      )
    ) {
      acceptPolishModelStatus({
        setProgress: ports.setProgress,
        status: { message: "Verifying Polish model", state: "verifying" },
        statusSynchronizer: ports.statusSynchronizer,
      });
    }
  });

const registerVerificationProgress = (ports: PolishModelPorts) =>
  listen<unknown>("model-verification-progress", (event) => {
    if (!ports.isStopped()) {
      handlePolishVerificationProgress({
        modelId: ports.statusSynchronizer.currentModelId(),
        payload: event.payload,
        setProgress: ports.setProgress,
        statusSynchronizer: ports.statusSynchronizer,
      });
    }
  });

const polishEventRegistrations = (ports: PolishModelPorts) => [
  () => registerPolishStatus(ports),
  () => registerDownloadComplete(ports),
  () => registerDownloadFailure(ports),
  () => registerDownloadProgress(ports),
  () => registerVerificationStart(ports),
  () => registerVerificationProgress(ports),
];

interface UsePolishEventsOptions {
  session: ReturnType<typeof createPolishModelSession>;
  setProgress: PolishModelPorts["setProgress"];
}

const usePolishModelEvents = ({
  session,
  setProgress,
}: UsePolishEventsOptions) => {
  useEffect(() => {
    let cleanup: UnlistenFn = () => undefined;
    const lifecycle = session.begin();
    const setup = async () => {
      try {
        cleanup = await subscribeEventListeners({
          isCancelled: lifecycle.isStopped,
          registrations: polishEventRegistrations({
            isStopped: lifecycle.isStopped,
            setProgress,
            statusSynchronizer: session,
          }),
        });
        if (!lifecycle.isStopped()) {
          session.requestRefresh();
        }
      } catch {
        cleanup();
        if (!lifecycle.isStopped()) {
          session.accept(polishModelFailure("setup"));
        }
      }
    };
    setup().catch(() => {
      if (!lifecycle.isStopped()) {
        session.accept(polishModelFailure("setup"));
      }
    });
    return () => {
      lifecycle.stop();
      cleanup();
    };
  }, [session, setProgress]);
};

interface PolishCommandError {
  message: string;
  state: PolishStatus["state"] | undefined;
}

export const usePolishModel = () => {
  const [status, setStatus] = useState(initialPolishModelStatus);
  const [progress, setProgress] = useState<PolishModelProgress>();
  const [commandError, setCommandError] = useState<PolishCommandError>();
  const [session] = useState(() =>
    createPolishModelSession({
      readStatus: () => invoke<unknown>("get_polish_status"),
      setStatus: (next) => {
        setStatus(next);
        setCommandError((error) =>
          error?.state === next.state ? error : undefined
        );
      },
    })
  );
  usePolishModelEvents({ session, setProgress });

  const run = async (
    command: "download_polish_model" | "repair_polish_model"
  ) => {
    setCommandError(undefined);
    try {
      await runPolishModelCommand({
        invokeCommand: () => invoke(command),
        pendingState:
          command === "download_polish_model" ? "downloading" : "preparing",
        setProgress,
        statusSynchronizer: session,
      });
    } catch (error) {
      setCommandError({
        message: errorMessage(error, "Something went wrong. Retry."),
        state: session.currentState(),
      });
    }
  };
  return {
    download: () => run("download_polish_model"),
    error: commandError?.message,
    progress,
    repair: () => run("repair_polish_model"),
    status,
  };
};
