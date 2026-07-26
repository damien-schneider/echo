import { ArrowDownToLine, Check } from "lucide-react";
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
import type { NotificationController } from "@/features/overlay-notification/use-notification-controller";

const ChatIsland = ({ onClose }: { onClose: () => void }) => (
  <div className="echo-island-chat">
    <ChatPanel isOpen={true} onClose={onClose} />
  </div>
);

const actionIcon = (intent: ActivityAction["intent"]) =>
  intent === "finish_recording" ? (
    <Check aria-hidden="true" className="size-3.5" />
  ) : (
    <ArrowDownToLine aria-hidden="true" className="size-3.5" />
  );

const islandAction = (
  controller: NotificationController
): ActivityIslandAction | null => {
  const action = controller.presentation.activityAction;
  if (action === null) {
    return null;
  }
  return {
    icon: actionIcon(action.intent),
    label: action.label,
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
  if (mode === "chat") {
    return <ChatIsland onClose={controller.dismissSurface} />;
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
      microphoneRef={controller.microphoneRef}
      onDismiss={controller.dismissActivity}
      text={presentation.activityText}
      textScrollRef={controller.textScrollRef}
      visualState={presentation.activityVisualState}
    />
  );
};
