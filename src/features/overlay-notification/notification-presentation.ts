import {
  type ActivityAction,
  type ActivityDecoration,
  type ActivityVisualState,
  activityDecorationFor,
  activityDismissalFor,
  activityVisualStateFor,
  isActiveOverlayState,
  modelStateLabel,
  type NotificationMode,
  notificationModeFor,
  type OverlayEscapeIntent,
  overlayActivityText,
  overlayEscapeIntent,
} from "@/features/overlay-controls/recording-overlay-state";
import type { NotificationRequest } from "@/features/overlay-controls/runtime/overlay-windows";
import type { useOverlayEvents } from "@/features/overlay-controls/use-overlay-events";
import type { UpdateNotice } from "@/features/overlay-notification/update-notice";
import type { ModelState } from "@/lib/model-state";

export interface NotificationPresentation {
  activityAction: ActivityAction | null;
  activityDecoration: ActivityDecoration;
  activityDismissal: ReturnType<typeof activityDismissalFor>;
  activityText: string;
  activityVisualState: ActivityVisualState;
  escapeIntent: OverlayEscapeIntent;
  hasActiveOperation: boolean;
  mode: NotificationMode | null;
}

interface NotificationPresentationOptions {
  events: ReturnType<typeof useOverlayEvents>;
  modelState: ModelState;
  request: NotificationRequest | null;
  updateNotice: UpdateNotice | null;
}

interface ActivityShape {
  decoration: ActivityDecoration;
  text: string;
  visualState: ActivityVisualState;
}

const activityActionFor = (
  isRecording: boolean,
  notice: UpdateNotice | null
): ActivityAction | null => {
  if (isRecording) {
    return {
      intent: "finish_recording",
      label: "Transcribe",
      title: "Finish recording and transcribe",
    };
  }
  if (notice?.actionLabel) {
    return {
      intent: "install_update",
      label: notice.actionLabel,
      title: "Install the update and restart Echo",
    };
  }
  return null;
};

/// A null mode means the window has nothing to say and collapses back into the
/// notch.
export const createNotificationPresentation = ({
  events,
  modelState,
  request,
  updateNotice,
}: NotificationPresentationOptions): NotificationPresentation => {
  const hasActiveOperation =
    events.isVisible && isActiveOverlayState(events.state);
  const isRecording = hasActiveOperation && events.state === "recording";
  const isTranscribing = hasActiveOperation && events.state === "transcribing";
  const isPolishing = hasActiveOperation && events.state === "processing";
  const activityError = events.eventError;
  const showsBackgroundDownload = events.download !== null && request === null;
  const hasPassiveActivity =
    (events.isVisible && !hasActiveOperation) ||
    activityError !== null ||
    showsBackgroundDownload;
  // The update is the quietest thing the notch can say, so anything else wins.
  const notice =
    request === null && !(hasActiveOperation || hasPassiveActivity)
      ? updateNotice
      : null;
  const mode = notificationModeFor({
    isShown: events.isVisible || hasPassiveActivity || notice !== null,
    request,
  });
  const activity: ActivityShape = notice ?? {
    decoration: activityDecorationFor({
      hasError: activityError !== null,
      isPolishing,
      isRecording,
      isTranscribing,
      showsDownload: showsBackgroundDownload,
    }),
    text: overlayActivityText({
      activityError,
      download: events.download,
      isVisible: events.isVisible,
      modelBadge: modelStateLabel(modelState),
      state: events.state,
      streamingText: events.streamingText,
      warningMessage: events.warningMessage,
    }),
    visualState: activityVisualStateFor({
      hasError: activityError !== null,
      isProcessing: isPolishing || isTranscribing || showsBackgroundDownload,
    }),
  };

  return {
    activityAction: activityActionFor(isRecording, notice),
    activityDecoration: activity.decoration,
    activityDismissal: activityDismissalFor({
      hasActiveOperation,
      hasPassiveActivity,
      hasUpdateNotice: notice?.isDismissible ?? false,
    }),
    activityText: activity.text,
    activityVisualState: activity.visualState,
    escapeIntent:
      mode === null
        ? "none"
        : overlayEscapeIntent({ hasActiveOperation, mode }),
    hasActiveOperation,
    mode,
  };
};
