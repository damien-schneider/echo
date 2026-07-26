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
import { PolishStatusSchema } from "@/lib/types";

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
        payload: event.payload,
        refreshStatus: ports.statusSynchronizer.requestRefresh,
        setProgress: ports.setProgress,
      });
    }
  });

const registerDownloadFailure = (ports: PolishModelPorts) =>
  listen<unknown>("model-download-failed", (event) => {
    if (!ports.isStopped() && isPolishModelEvent(event.payload)) {
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
        payload: event.payload,
        setProgress: ports.setProgress,
        statusSynchronizer: ports.statusSynchronizer,
      });
    }
  });

const registerVerificationStart = (ports: PolishModelPorts) =>
  listen<unknown>("model-verification-started", (event) => {
    if (!ports.isStopped() && isPolishModelEvent(event.payload)) {
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

export const usePolishModel = () => {
  const [status, setStatus] = useState(initialPolishModelStatus);
  const [progress, setProgress] = useState<PolishModelProgress>();
  const [session] = useState(() =>
    createPolishModelSession({
      readStatus: () => invoke<unknown>("get_polish_status"),
      setStatus,
    })
  );
  usePolishModelEvents({ session, setProgress });

  const download = () =>
    runPolishModelCommand({
      invokeCommand: () => invoke("download_polish_model"),
      setProgress,
      statusSynchronizer: session,
    });
  const repair = () =>
    runPolishModelCommand({
      invokeCommand: () => invoke("repair_polish_model"),
      pendingState: "preparing",
      setProgress,
      statusSynchronizer: session,
    });

  return { download, progress, repair, status };
};
