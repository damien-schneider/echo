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
  type OverlayRemedy,
  overlayActivityText,
  overlayEscapeIntent,
  PREPARING_LABEL,
} from "@/features/overlay-controls/recording-overlay-state";
import { tellsDownloadFailure } from "@/features/overlay-controls/runtime/overlay-activity-state";
import type { NotificationRequest } from "@/features/overlay-controls/runtime/overlay-windows";
import type { useOverlayEvents } from "@/features/overlay-controls/use-overlay-events";
import type { MeetingNotice } from "@/features/overlay-notification/meeting-notice";
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
  meetingNotice: MeetingNotice | null;
  modelState: ModelState;
  request: NotificationRequest | null;
  updateNotice: UpdateNotice | null;
}

interface ActivityShape {
  decoration: ActivityDecoration;
  text: string;
  visualState: ActivityVisualState;
}

interface ActivityActionOptions {
  isPreparing: boolean;
  isRecording: boolean;
  meeting: MeetingNotice | null;
  notice: UpdateNotice | null;
  remedy: OverlayRemedy | null;
}

const activityActionFor = ({
  isPreparing,
  isRecording,
  meeting,
  notice,
  remedy,
}: ActivityActionOptions): ActivityAction | null => {
  if (isPreparing || isRecording) {
    return {
      intent: "finish_recording",
      isPending: isPreparing,
      title: isPreparing ? PREPARING_LABEL : "Finish recording and transcribe",
    };
  }
  if (remedy !== null) {
    return {
      intent: remedy,
      isPending: false,
      title: "Download the transcription model",
    };
  }
  if (meeting?.actionLabel) {
    return {
      intent: "stop_meeting",
      isPending: false,
      title: "Stop the meeting and transcribe it",
    };
  }
  if (notice?.actionLabel) {
    return {
      intent: "install_update",
      isPending: false,
      title: "Install the update and restart Echo",
    };
  }
  return null;
};

const isActivityShown = ({
  events,
  request,
}: Pick<NotificationPresentationOptions, "events" | "request">) => {
  const isFailureBehindSurface =
    request !== null && tellsDownloadFailure(events);
  return events.isVisible && !isFailureBehindSurface;
};

/// A null mode means nothing to say — the window collapses back into the notch.
export const createNotificationPresentation = ({
  events,
  meetingNotice,
  modelState,
  request,
  updateNotice,
}: NotificationPresentationOptions): NotificationPresentation => {
  const isVisible = isActivityShown({ events, request });
  const hasActiveOperation = isVisible && isActiveOverlayState(events.state);
  const isPreparing = hasActiveOperation && events.state === "preparing";
  const isRecording = hasActiveOperation && events.state === "recording";
  const isTranscribing = hasActiveOperation && events.state === "transcribing";
  const isPolishing = hasActiveOperation && events.state === "processing";
  const activityError = events.eventError;
  const showsBackgroundDownload = events.download !== null && request === null;
  const hasPassiveActivity =
    (isVisible && !hasActiveOperation) ||
    activityError !== null ||
    showsBackgroundDownload;
  const hasQuietIsland =
    request === null && !(hasActiveOperation || hasPassiveActivity);
  // A running meeting owns the quiet notch; the update is the quietest thing it can say.
  const meeting = hasQuietIsland ? meetingNotice : null;
  const notice = hasQuietIsland && meeting === null ? updateNotice : null;
  const mode = notificationModeFor({
    isShown:
      isVisible || hasPassiveActivity || meeting !== null || notice !== null,
    request,
  });
  const activity: ActivityShape = meeting ??
    notice ?? {
      decoration: activityDecorationFor({
        hasError: activityError !== null,
        isPolishing,
        isPreparing,
        isRecording,
        isTranscribing,
        showsDownload: showsBackgroundDownload,
      }),
      text: overlayActivityText({
        activityError,
        download: events.download,
        isVisible,
        modelBadge: modelStateLabel({ modelState, overlayState: events.state }),
        state: events.state,
        streamingText: events.streamingText,
        warningMessage: events.warningMessage,
      }),
      visualState: activityVisualStateFor({
        hasError: activityError !== null,
        isProcessing:
          isPolishing ||
          isPreparing ||
          isTranscribing ||
          showsBackgroundDownload,
      }),
    };

  return {
    activityAction: activityActionFor({
      isPreparing,
      isRecording,
      meeting,
      notice,
      remedy: isVisible ? events.remedy : null,
    }),
    activityDecoration: activity.decoration,
    activityDismissal: activityDismissalFor({
      hasActiveOperation,
      hasMeetingNotice: meeting?.isDismissible ?? false,
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
