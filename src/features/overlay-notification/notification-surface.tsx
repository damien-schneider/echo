import { ChatPanel } from "@/features/overlay-chat/chat-panel";
import { useChatSessionHold } from "@/features/overlay-chat/use-chat-session";
import { PolishModelPanel } from "@/features/overlay-controls/polish-model-panel";
import type { NotificationMode } from "@/features/overlay-controls/recording-overlay-state";
import {
  ActivityIsland,
  type ActivityIslandAction,
} from "@/features/overlay-notification/activity-island";
import { TranscriptPanel } from "@/features/overlay-notification/transcript-panel";
import type { NotificationController } from "@/features/overlay-notification/use-notification-controller";

const islandAction = (
  controller: NotificationController
): ActivityIslandAction | null => {
  const action = controller.presentation.activityAction;
  if (action === null) {
    return null;
  }
  return {
    ...action,
    onAction: () => controller.runActivityAction(action.intent),
  };
};

interface NotificationSurfaceProps {
  controller: NotificationController;
  isIslandHovered: boolean;
  mode: NotificationMode;
}

export const NotificationSurface = ({
  controller,
  isIslandHovered,
  mode,
}: NotificationSurfaceProps) => {
  const { chatContext, closedChatGeneration, polish, presentation } =
    controller;
  const surface = controller.events.surface;
  const hasFlanks =
    surface !== null && surface.notch !== null && surface.anchor === "top";
  const chatGeneration =
    chatContext?.generation ?? (mode === "chat" ? closedChatGeneration : null);
  const isChatReplaced = mode === "panel" || mode === "transcript";
  useChatSessionHold(isChatReplaced ? null : chatGeneration);
  if (mode === "chat" && chatGeneration !== null) {
    return (
      <ChatPanel
        bundledModel={polish}
        context={chatContext?.state === "ready" ? chatContext.context : null}
        contextState={chatContext?.state ?? "loading"}
        generation={chatGeneration}
        hasFlanks={hasFlanks}
        onClose={controller.dismissSurface}
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
      isHovered={isIslandHovered}
      onDismiss={controller.dismissActivity}
      text={presentation.activityText}
      textScrollRef={controller.textScrollRef}
      visualState={presentation.activityVisualState}
      voice={controller.voice}
    />
  );
};
