import { z } from "zod";
import type { NotificationRequest } from "@/features/overlay-controls/runtime/overlay-windows";
import type { ModelState } from "@/lib/model-state";
import type { PolishStatus } from "@/lib/types";

/// What the island can do about the block it is showing — Rust names it, the island offers it.
export const OverlayRemedySchema = z.literal("download_transcription_model");
export type OverlayRemedy = z.infer<typeof OverlayRemedySchema>;

export type OverlayState =
  | "preparing"
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
  state === "preparing" ||
  state === "recording" ||
  state === "transcribing" ||
  state === "processing";

interface ActivityDismissalOptions {
  hasActiveOperation: boolean;
  hasMeetingNotice: boolean;
  hasPassiveActivity: boolean;
  hasUpdateNotice: boolean;
}

export const activityDismissalFor = ({
  hasActiveOperation,
  hasMeetingNotice,
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
  if (hasMeetingNotice) {
    return {
      intent: "dismiss_meeting" as const,
      label: "Hide the meeting timer",
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
  intent:
    | OverlayRemedy
    | "finish_recording"
    | "install_update"
    | "stop_meeting";
  isPending: boolean;
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
  isPreparing: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  showsDownload: boolean;
}

export const activityDecorationFor = ({
  hasError,
  isPolishing,
  isPreparing,
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
  if (isPreparing) {
    return "none";
  }
  if (isRecording) {
    return "microphone";
  }
  if (isTranscribing) {
    return "progress";
  }
  return showsDownload ? "progress" : "none";
};

export type IslandEdge = "drift" | "voice";

export const activityEdgeFor = (
  decoration: ActivityDecoration
): IslandEdge | null => {
  if (decoration === "orbit" || decoration === "progress") {
    return "drift";
  }
  return decoration === "microphone" ? "voice" : null;
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

const sharesDictationShell = (state: OverlayState) =>
  state === "preparing" || state === "recording" || state === "transcribing";

export const overlayContentKey = ({
  mode,
  overlayState,
  polishState,
}: OverlayContentKeyOptions) => {
  if (mode === "recording") {
    return `activity:${sharesDictationShell(overlayState) ? "dictation" : overlayState}`;
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

export const PREPARING_LABEL = "Preparing local model…";

interface ModelStateLabelOptions {
  modelState: ModelState;
  overlayState: OverlayState;
}

/// Capture shows the load on the finish button; recording goes live only after the model has loaded.
export const modelStateLabel = ({
  modelState,
  overlayState,
}: ModelStateLabelOptions): string | null => {
  const isCapturing =
    overlayState === "preparing" || overlayState === "recording";
  if (modelState === "Loading" && !isCapturing) {
    return PREPARING_LABEL;
  }
  if (modelState === "Error") {
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

/// What the island says when a state has nothing of its own to show yet.
const ACTIVITY_FALLBACK_TEXT: Partial<Record<OverlayState, string>> = {
  transcribing: "Transcribing…",
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
    return ACTIVITY_FALLBACK_TEXT[displayOptions.state] ?? "";
  }
  if (download) {
    return modelDownloadLabel(download.model_id, download.percentage);
  }
  return "";
};

// meter maps -60…-6 dB to 0…1: room noise (~-50 dB) reads 0.28, speech (~-20 dB) 0.8
const ROOM_NOISE_LEVEL = 0.3;
const SPEECH_LEVEL = 0.8;

export const voiceLevel = (levels: number[]) => {
  const loudest = Math.max(0, ...levels.filter(Number.isFinite));
  const voice =
    (loudest - ROOM_NOISE_LEVEL) / (SPEECH_LEVEL - ROOM_NOISE_LEVEL);
  return Math.min(1, Math.max(0, voice));
};
