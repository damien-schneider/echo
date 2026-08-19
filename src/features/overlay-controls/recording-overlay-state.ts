import type { NotificationRequest } from "@/features/overlay-controls/runtime/overlay-windows";
import type { ModelState } from "@/lib/model-state";
import type { PolishStatus } from "@/lib/types";

export type OverlayState =
  | "processing"
  | "recording"
  | "tool"
  | "transcribing"
  | "warning";
/// Handle or action row — everything else is a notification, drawn by the other window.
export type HudMode = "compact" | "actions";
export type NotificationMode = "recording" | "panel" | "transcript" | "chat";
export type OverlayMode = HudMode | NotificationMode;

export type OverlayEscapeIntent =
  | "cancel_operation"
  | "dismiss_surface"
  | "none";
export type IslandActionState = "busy" | "idle" | "recording";
export type ActivityVisualState = "error" | "processing" | "steady";
export type ActivityDecoration = "microphone" | "none" | "orbit" | "progress";

export const isActiveOverlayState = (state: OverlayState) =>
  state === "recording" || state === "transcribing" || state === "processing";

interface ActivityDismissalOptions {
  hasActiveOperation: boolean;
  hasPassiveActivity: boolean;
  hasUpdateNotice: boolean;
}

export const activityDismissalFor = ({
  hasActiveOperation,
  hasPassiveActivity,
  hasUpdateNotice,
}: ActivityDismissalOptions) => {
  if (hasActiveOperation) {
    return {
      intent: "cancel_operation" as const,
      label: "Cancel current operation",
    };
  }
  if (hasPassiveActivity) {
    return {
      intent: "dismiss_surface" as const,
      label: "Dismiss notification",
    };
  }
  if (hasUpdateNotice) {
    return {
      intent: "dismiss_update" as const,
      label: "Dismiss update notice",
    };
  }
  return null;
};

/// The one button the activity bar offers, whatever is speaking through it.
export interface ActivityAction {
  intent: "finish_recording" | "install_update";
  title: string;
}

interface HorizontalOverflowMetrics {
  clientWidth: number;
  scrollWidth: number;
}

export const hasHorizontalOverflow = ({
  clientWidth,
  scrollWidth,
}: HorizontalOverflowMetrics) => scrollWidth > clientWidth;

interface IslandActionStateOptions {
  hasActiveOperation: boolean;
  isRecording: boolean;
}

export const islandActionStateFor = ({
  hasActiveOperation,
  isRecording,
}: IslandActionStateOptions): IslandActionState => {
  if (isRecording) {
    return "recording";
  }
  return hasActiveOperation ? "busy" : "idle";
};

interface ActivityVisualStateOptions {
  hasError: boolean;
  isProcessing: boolean;
}

export const activityVisualStateFor = ({
  hasError,
  isProcessing,
}: ActivityVisualStateOptions): ActivityVisualState => {
  if (hasError) {
    return "error";
  }
  return isProcessing ? "processing" : "steady";
};

interface ActivityDecorationOptions {
  hasError: boolean;
  isPolishing: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  showsDownload: boolean;
}

export const activityDecorationFor = ({
  hasError,
  isPolishing,
  isRecording,
  isTranscribing,
  showsDownload,
}: ActivityDecorationOptions): ActivityDecoration => {
  if (hasError) {
    return "none";
  }
  if (isPolishing) {
    return "orbit";
  }
  if (isRecording) {
    return "microphone";
  }
  if (isTranscribing) {
    return "progress";
  }
  return showsDownload ? "progress" : "none";
};

export type IslandEdge = "ambience" | "trace";

/// Work in flight rings the whole island, listening breathes on it, a settled surface leaves it alone.
export const activityEdgeFor = (
  decoration: ActivityDecoration
): IslandEdge | null => {
  if (decoration === "orbit" || decoration === "progress") {
    return "trace";
  }
  return decoration === "microphone" ? "ambience" : null;
};

export const hudModeFor = (isControlsOpen: boolean): HudMode =>
  isControlsOpen ? "actions" : "compact";

interface NotificationModeOptions {
  isShown: boolean;
  request: NotificationRequest | null;
}

/// Activity outranks anything the HUD asked for — a recording takes the surface from chat.
export const notificationModeFor = ({
  isShown,
  request,
}: NotificationModeOptions): NotificationMode | null => {
  if (isShown) {
    return "recording";
  }
  return request;
};

interface OverlayContentKeyOptions {
  mode: OverlayMode;
  overlayState: OverlayState;
  polishState: PolishStatus["state"];
}

export const overlayContentKey = ({
  mode,
  overlayState,
  polishState,
}: OverlayContentKeyOptions) => {
  if (mode === "recording") {
    return `activity:${overlayState}`;
  }
  if (mode === "panel") {
    return `panel:${polishState}`;
  }
  return mode;
};

interface OverlayEscapeOptions {
  hasActiveOperation: boolean;
  mode: OverlayMode;
}

export const overlayEscapeIntent = ({
  hasActiveOperation,
  mode,
}: OverlayEscapeOptions): OverlayEscapeIntent => {
  if (hasActiveOperation) {
    return "cancel_operation";
  }
  if (mode === "chat" || mode === "panel" || mode === "transcript") {
    return "dismiss_surface";
  }
  return "none";
};

export const polishControlIntent = (
  status: PolishStatus
): "run" | "open_panel" => (status.state === "ready" ? "run" : "open_panel");

export const modelStateLabel = (state: ModelState): string | null => {
  if (state === "Loading") {
    return "Preparing local model…";
  }
  if (state === "Error") {
    return "Local model error";
  }
  return null;
};

export const isDisplayableProgress = (text: string) => text.trim().length > 0;

export const modelDownloadLabel = (modelId: string, percentage: number) => {
  if (modelId === "polish-qwen3-4b-instruct-2507") {
    return `Downloading Polish… ${Math.round(percentage)}%`;
  }
  if (modelId === "diarization-sortformer") {
    return `Downloading speaker detection model… ${Math.round(percentage)}%`;
  }
  return `Downloading transcription model… ${Math.round(percentage)}%`;
};

export interface OverlayDownloadProgress {
  model_id: string;
  percentage: number;
}

interface OverlayDisplayOptions {
  modelBadge: string | null;
  state: OverlayState;
  streamingText: string;
  warningMessage: string;
}

export const overlayDisplayText = ({
  modelBadge,
  state,
  warningMessage,
  streamingText,
}: OverlayDisplayOptions) => {
  if (state === "processing" || state === "warning" || state === "tool") {
    return warningMessage;
  }
  if (streamingText) {
    return streamingText;
  }
  return modelBadge ?? "";
};

interface OverlayActivityTextOptions extends OverlayDisplayOptions {
  activityError: string | null;
  download: OverlayDownloadProgress | null;
  isVisible: boolean;
}

export const overlayActivityText = ({
  activityError,
  download,
  isVisible,
  ...displayOptions
}: OverlayActivityTextOptions) => {
  if (activityError) {
    return activityError;
  }
  if (isVisible) {
    const displayText = overlayDisplayText(displayOptions);
    if (displayText) {
      return displayText;
    }
    return displayOptions.state === "transcribing" ? "Transcribing…" : "";
  }
  if (download) {
    return modelDownloadLabel(download.model_id, download.percentage);
  }
  return "";
};

interface MicrophoneAmbienceElement {
  style: { setProperty: (name: string, value: string) => void };
}

const normalizedLevel = (level: number) => {
  if (!Number.isFinite(level)) {
    return 0;
  }
  return Math.min(1, Math.max(0, level));
};

export const microphoneIntensity = (levels: number[]) => {
  if (levels.length === 0) {
    return { energy: 0, peak: 0 };
  }
  let squaredTotal = 0;
  let peak = 0;
  for (const level of levels) {
    const normalized = normalizedLevel(level);
    squaredTotal += normalized * normalized;
    peak = Math.max(peak, normalized);
  }
  const rootMeanSquare = Math.sqrt(squaredTotal / levels.length);
  return { energy: rootMeanSquare ** 0.55, peak };
};

export const updateMicrophoneAmbience = (
  element: MicrophoneAmbienceElement,
  levels: number[]
) => {
  const intensity = microphoneIntensity(levels);
  element.style.setProperty("--echo-mic-energy", intensity.energy.toFixed(3));
  element.style.setProperty("--echo-mic-peak", intensity.peak.toFixed(3));
};
