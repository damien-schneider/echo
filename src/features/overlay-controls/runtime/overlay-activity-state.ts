import {
  isActiveOverlayState,
  type OverlayDownloadProgress,
  type OverlayRemedy,
  type OverlayState,
} from "@/features/overlay-controls/recording-overlay-state";

export interface OverlayActivity {
  dismissedDownloadId: string | null;
  download: OverlayDownloadProgress | null;
  error: string | null;
  /// A replayed state only fills the silence before the first live show or hide.
  hasHeardVisibility: boolean;
  isVisible: boolean;
  remedy: OverlayRemedy | null;
  state: OverlayState;
  streamingText: string;
  warningMessage: string;
}

export type OverlayActivityEvent =
  | { modelId: string; type: "download_failed" }
  | { modelId: string; type: "download_finished" }
  | { download: OverlayDownloadProgress; type: "download_progress" }
  | {
      action?: OverlayRemedy | null;
      message: string;
      state: OverlayState;
      type: "shown";
    }
  | { message: string; type: "failed" }
  | { text: string; type: "progress" }
  | { type: "dismissed" }
  | { type: "hidden" }
  | { state: OverlayState; type: "replayed" };

export const initialOverlayActivity: OverlayActivity = {
  dismissedDownloadId: null,
  download: null,
  error: null,
  hasHeardVisibility: false,
  isVisible: false,
  remedy: null,
  state: "recording",
  streamingText: "",
  warningMessage: "",
};

const shown = (
  state: OverlayActivity,
  event: Extract<OverlayActivityEvent, { type: "shown" }>
): OverlayActivity => ({
  ...state,
  hasHeardVisibility: true,
  isVisible: true,
  remedy: event.action ?? null,
  state: event.state,
  streamingText:
    event.state === "preparing" || event.state === "recording"
      ? ""
      : state.streamingText,
  warningMessage: event.message,
});

const DOWNLOAD_FAILURE_MESSAGE =
  "Model download failed — check your connection and retry";

export const tellsDownloadFailure = (
  activity: Pick<OverlayActivity, "isVisible" | "warningMessage">
) => activity.isVisible && activity.warningMessage === DOWNLOAD_FAILURE_MESSAGE;

const downloadProgress = (
  state: OverlayActivity,
  incoming: OverlayDownloadProgress
): OverlayActivity => {
  if (state.dismissedDownloadId === incoming.model_id) {
    return state;
  }
  const holdsAnotherDownload =
    state.download !== null && state.download.model_id !== incoming.model_id;
  if (holdsAnotherDownload) {
    return state;
  }
  // an offered or retried download: its progress takes over from the notice that asked for it
  const asksForDownload = state.remedy !== null || tellsDownloadFailure(state);
  return asksForDownload
    ? {
        ...state,
        download: incoming,
        isVisible: false,
        remedy: null,
        warningMessage: "",
      }
    : { ...state, download: incoming };
};

const downloadFinished = (
  state: OverlayActivity,
  modelId: string
): OverlayActivity => ({
  ...state,
  dismissedDownloadId:
    state.dismissedDownloadId === modelId ? null : state.dismissedDownloadId,
  download: state.download?.model_id === modelId ? null : state.download,
});

// a notice over a live operation would take its controls off the island
const downloadFailed = (
  state: OverlayActivity,
  modelId: string
): OverlayActivity => {
  const settled = downloadFinished(state, modelId);
  const isBehindLiveOperation =
    state.isVisible && isActiveOverlayState(state.state);
  if (state.download?.model_id !== modelId || isBehindLiveOperation) {
    return settled;
  }
  return {
    ...settled,
    isVisible: true,
    remedy: null,
    state: "warning",
    warningMessage: DOWNLOAD_FAILURE_MESSAGE,
  };
};

// per-download — the same model must not reappear on its next progress tick
const dismissed = (state: OverlayActivity): OverlayActivity => ({
  ...state,
  dismissedDownloadId: state.download?.model_id ?? state.dismissedDownloadId,
  download: null,
  error: null,
  isVisible: false,
  remedy: null,
  warningMessage: "",
});

export const reduceOverlayActivity = (
  state: OverlayActivity,
  event: OverlayActivityEvent
): OverlayActivity => {
  switch (event.type) {
    case "shown":
      return shown(state, event);
    case "hidden":
      return state.isVisible || !state.hasHeardVisibility
        ? { ...state, hasHeardVisibility: true, isVisible: false }
        : state;
    case "replayed":
      return state.hasHeardVisibility
        ? state
        : shown(state, { message: "", state: event.state, type: "shown" });
    case "progress":
      return { ...state, streamingText: event.text };
    case "download_progress":
      return downloadProgress(state, event.download);
    case "download_finished":
      return downloadFinished(state, event.modelId);
    case "download_failed":
      return downloadFailed(state, event.modelId);
    case "failed":
      return { ...state, error: event.message };
    default:
      return dismissed(state);
  }
};
