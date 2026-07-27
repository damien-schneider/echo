import { z } from "zod";
import { DownloadProgressSchema } from "@/features/model-download/download-state";
import { type PolishStatus, PolishStatusSchema } from "@/lib/types";

export const polishModelId = "polish-qwen3-4b-instruct-2507";

export interface PolishModelProgress {
  percentage: number;
  phase: "download" | "verification";
}

export const initialPolishModelStatus: PolishStatus = {
  message: "Checking the local Polish model",
  state: "preparing",
};

const polishModelEventSchema = z.literal(polishModelId);

const failureStatuses = {
  download: {
    message:
      "The Polish model download failed. Check your connection and retry.",
    state: "repair",
  },
  setup: {
    message:
      "Polish could not connect to its local model service. Reopen Echo and try again.",
    state: "repair",
  },
} satisfies Record<"download" | "setup", PolishStatus>;

export const isPolishModelEvent = (payload: unknown) =>
  polishModelEventSchema.safeParse(payload).success;

export const parsePolishDownloadProgress = (payload: unknown) => {
  const parsed = DownloadProgressSchema.safeParse(payload);
  if (!parsed.success || parsed.data.model_id !== polishModelId) {
    return;
  }
  return parsed.data.percentage;
};

export const parsePolishVerificationProgress = parsePolishDownloadProgress;

export const polishModelFailure = (operation: "download" | "setup") =>
  failureStatuses[operation];

interface SynchronizePolishModelOptions {
  isStopped: () => boolean;
  readStatus: () => Promise<unknown>;
  setStatus: (status: PolishStatus) => void;
}

export const synchronizePolishModelStatus = async ({
  isStopped,
  readStatus,
  setStatus,
}: SynchronizePolishModelOptions) => {
  try {
    const payload = await readStatus();
    const parsed = PolishStatusSchema.safeParse(payload);
    if (!isStopped()) {
      setStatus(parsed.success ? parsed.data : polishModelFailure("setup"));
    }
  } catch {
    if (!isStopped()) {
      setStatus(polishModelFailure("setup"));
    }
  }
};

export const createPolishStatusSynchronizer = (
  options: SynchronizePolishModelOptions
) => {
  let generation = 0;
  const accept = (status: PolishStatus) => {
    generation += 1;
    currentStatus = status;
    if (!options.isStopped()) {
      options.setStatus(status);
    }
  };
  let currentStatus: PolishStatus | undefined;
  /// The refreshed snapshot is authoritative — later events are judged against it, not the last event.
  const refresh = () => {
    generation += 1;
    const refreshGeneration = generation;
    return synchronizePolishModelStatus({
      isStopped: () => options.isStopped() || refreshGeneration !== generation,
      readStatus: options.readStatus,
      setStatus: (status) => {
        currentStatus = status;
        options.setStatus(status);
      },
    });
  };
  const requestRefresh = () => {
    refresh().catch(() => accept(polishModelFailure("setup")));
  };
  return {
    accept,
    currentState: () => currentStatus?.state,
    refresh,
    requestRefresh,
  };
};

type CreatePolishModelSessionOptions = Omit<
  SynchronizePolishModelOptions,
  "isStopped"
>;

export const createPolishModelSession = (
  options: CreatePolishModelSessionOptions
) => {
  let generation = 0;
  let activeGeneration = 0;
  const statusSynchronizer = createPolishStatusSynchronizer({
    ...options,
    isStopped: () => activeGeneration === 0,
  });
  return {
    ...statusSynchronizer,
    begin: () => {
      generation += 1;
      const lifecycleGeneration = generation;
      activeGeneration = lifecycleGeneration;
      return {
        isStopped: () => activeGeneration !== lifecycleGeneration,
        stop: () => {
          if (activeGeneration === lifecycleGeneration) {
            activeGeneration = 0;
          }
        },
      };
    },
  };
};

type PolishStatusSynchronizer = ReturnType<
  typeof createPolishStatusSynchronizer
>;

interface AcceptPolishModelStatusOptions {
  setProgress: (progress: PolishModelProgress | undefined) => void;
  status: PolishStatus;
  statusSynchronizer: Pick<PolishStatusSynchronizer, "accept">;
}

export const acceptPolishModelStatus = ({
  setProgress,
  status,
  statusSynchronizer,
}: AcceptPolishModelStatusOptions) => {
  if (status.state !== "downloading") {
    setProgress(undefined);
  }
  statusSynchronizer.accept(status);
};

interface HandleDownloadProgressOptions {
  payload: unknown;
  setProgress: (progress: PolishModelProgress) => void;
  statusSynchronizer: Pick<PolishStatusSynchronizer, "accept" | "currentState">;
}

const reportsProgress = (state: PolishStatus["state"] | undefined) =>
  state === "downloading" || state === "verifying";

const blocksEarlierProgress = (state: PolishStatus["state"] | undefined) =>
  state === "verifying" ||
  state === "loading" ||
  state === "ready" ||
  state === "repair";

export const handlePolishDownloadProgress = ({
  payload,
  setProgress,
  statusSynchronizer,
}: HandleDownloadProgressOptions) => {
  const progress = parsePolishDownloadProgress(payload);
  if (
    progress === undefined ||
    blocksEarlierProgress(statusSynchronizer.currentState())
  ) {
    return;
  }
  statusSynchronizer.accept({
    message: "Downloading Polish model",
    state: "downloading",
  });
  setProgress({ percentage: progress, phase: "download" });
};

export const handlePolishVerificationProgress = ({
  payload,
  setProgress,
  statusSynchronizer,
}: HandleDownloadProgressOptions) => {
  const progress = parsePolishVerificationProgress(payload);
  const state = statusSynchronizer.currentState();
  if (
    progress === undefined ||
    state === "loading" ||
    state === "ready" ||
    state === "repair"
  ) {
    return;
  }
  statusSynchronizer.accept({
    message: "Verifying Polish model",
    state: "verifying",
  });
  setProgress({ percentage: progress, phase: "verification" });
};

interface HandleDownloadCompleteOptions {
  payload: unknown;
  refreshStatus: () => void;
  setProgress: (progress: PolishModelProgress | undefined) => void;
}

export const handlePolishDownloadComplete = ({
  payload,
  refreshStatus,
  setProgress,
}: HandleDownloadCompleteOptions) => {
  if (!isPolishModelEvent(payload)) {
    return;
  }
  setProgress(undefined);
  refreshStatus();
};

interface RunPolishModelCommandOptions {
  invokeCommand: () => Promise<unknown>;
  pendingState?: "downloading" | "preparing";
  setProgress: (progress: PolishModelProgress | undefined) => void;
  statusSynchronizer: PolishStatusSynchronizer;
}

export const runPolishModelCommand = async ({
  invokeCommand,
  pendingState = "downloading",
  setProgress,
  statusSynchronizer,
}: RunPolishModelCommandOptions) => {
  setProgress(
    pendingState === "downloading"
      ? { percentage: 0, phase: "download" }
      : undefined
  );
  statusSynchronizer.accept({
    message:
      pendingState === "downloading"
        ? "Downloading Polish model"
        : "Preparing Polish model",
    state: pendingState,
  });
  try {
    await invokeCommand();
  } catch {
    setProgress(undefined);
    await statusSynchronizer.refresh();
    return;
  }
  await statusSynchronizer.refresh();
  /// A duplicate command returns to a running transfer — the bar belongs to that operation.
  if (!reportsProgress(statusSynchronizer.currentState())) {
    setProgress(undefined);
  }
};
