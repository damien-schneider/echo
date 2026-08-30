import type {
  OverlayDownloadProgress,
  OverlayRemedy,
  OverlayState,
} from "@/features/overlay-controls/recording-overlay-state";

export interface OverlayActivity {
  dismissedDownloadId: string | null;
  download: OverlayDownloadProgress | null;
  error: string | null;
  isVisible: boolean;
  remedy: OverlayRemedy | null;
  state: OverlayState;
  streamingText: string;
  warningMessage: string;
}

export type OverlayActivityEvent =
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
  | { type: "hidden" };

export const initialOverlayActivity: OverlayActivity = {
  dismissedDownloadId: null,
  download: null,
  error: null,
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
  isVisible: true,
  remedy: event.action ?? null,
  state: event.state,
  streamingText: event.state === "recording" ? "" : state.streamingText,
  warningMessage: event.message,
});

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
  // the download the island offered: its progress takes over from the block that asked for it
  return state.remedy === null
    ? { ...state, download: incoming }
    : {
        ...state,
        download: incoming,
        isVisible: false,
        remedy: null,
        warningMessage: "",
      };
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
      return state.isVisible ? { ...state, isVisible: false } : state;
    case "progress":
      return { ...state, streamingText: event.text };
    case "download_progress":
      return downloadProgress(state, event.download);
    case "download_finished":
      return downloadFinished(state, event.modelId);
    case "failed":
      return { ...state, error: event.message };
    default:
      return dismissed(state);
  }
};
