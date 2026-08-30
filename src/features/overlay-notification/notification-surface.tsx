import { ArrowDownToLine, Check, Square } from "lucide-react";
import { ChatPanel } from "@/features/overlay-chat/chat-panel";
import { PolishModelPanel } from "@/features/overlay-controls/polish-model-panel";
import type {
  ActivityAction,
  NotificationMode,
} from "@/features/overlay-controls/recording-overlay-state";
import {
  ActivityIsland,
  type ActivityIslandAction,
} from "@/features/overlay-notification/activity-island";
import { TranscriptPanel } from "@/features/overlay-notification/transcript-panel";
import type { NotificationController } from "@/features/overlay-notification/use-notification-controller";

const actionIcon = (intent: ActivityAction["intent"]) => {
  if (intent === "finish_recording") {
    return <Check aria-hidden="true" className="size-3.5" />;
  }
  if (intent === "stop_meeting") {
    return <Square aria-hidden="true" className="size-3" />;
  }
  return <ArrowDownToLine aria-hidden="true" className="size-3.5" />;
};

const islandAction = (
  controller: NotificationController
): ActivityIslandAction | null => {
  const action = controller.presentation.activityAction;
  if (action === null) {
    return null;
  }
  return {
    icon: actionIcon(action.intent),
    onAction: () => controller.runActivityAction(action.intent),
    title: action.title,
  };
};

interface NotificationSurfaceProps {
  controller: NotificationController;
  mode: NotificationMode;
}

export const NotificationSurface = ({
  controller,
  mode,
}: NotificationSurfaceProps) => {
  const { polish, presentation } = controller;
  const surface = controller.events.surface;
  const hasFlanks =
    surface !== null && surface.notch !== null && surface.anchor === "top";
  if (mode === "chat") {
    return (
      <ChatPanel
        bundledModel={polish}
        context={
          controller.chatContext?.state === "ready"
            ? controller.chatContext.context
            : null
        }
        contextState={controller.chatContext?.state ?? "loading"}
        hasFlanks={hasFlanks}
        isOpen={true}
        onClose={controller.dismissSurface}
        onManageModels={controller.openChatModelSettings}
        onRequestAccessibility={controller.requestAccessibilityAccess}
      />
    );
  }
  if (mode === "transcript") {
    return (
      <TranscriptPanel
        onClose={controller.dismissSurface}
        onCopy={controller.copyHeldTranscript}
        onSendToChat={controller.sendHeldTranscriptToChat}
        text={controller.heldTranscript}
      />
    );
  }
  if (mode === "panel") {
    return (
      <PolishModelPanel
        onClose={controller.dismissSurface}
        onDownload={polish.download}
        onRepair={polish.repair}
        progress={polish.progress}
        status={polish.status}
      />
    );
  }
  return (
    <ActivityIsland
      action={islandAction(controller)}
      decoration={presentation.activityDecoration}
      dismissLabel={presentation.activityDismissal?.label ?? null}
      hasFlanks={hasFlanks}
      onDismiss={controller.dismissActivity}
      text={presentation.activityText}
      textScrollRef={controller.textScrollRef}
      visualState={presentation.activityVisualState}
    />
  );
};
