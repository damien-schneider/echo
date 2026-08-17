import "@/overlay/recording-overlay.css";
import { AnimatePresence } from "motion/react";
import { useEffect, useEffectEvent } from "react";
import { IslandMorph } from "@/features/overlay-controls/motion/island-morph";
import { notchEntry } from "@/features/overlay-controls/motion/notch-entry";
import { activityEdgeFor } from "@/features/overlay-controls/recording-overlay-state";
import { NotificationSurface } from "@/features/overlay-notification/notification-surface";
import {
  NOTIFICATION_RELEASE_DELAY_MS,
  notificationWindowIsEmpty,
} from "@/features/overlay-notification/notification-window-release";
import { useNotificationController } from "@/features/overlay-notification/use-notification-controller";

const useReleaseEmptyWindow = (isEmpty: boolean, release: () => void) => {
  const releaseWindow = useEffectEvent(release);
  useEffect(() => {
    if (!isEmpty) {
      return;
    }
    const timer = setTimeout(releaseWindow, NOTIFICATION_RELEASE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isEmpty]);
};

/// Knows nothing about where the HUD sits — it only grows out of the notch and folds back in.
const NotificationOverlay = () => {
  const controller = useNotificationController();
  const surface = controller.events.surface;
  const mode = controller.renderMode;
  useReleaseEmptyWindow(
    notificationWindowIsEmpty({
      hasSurface: surface !== null,
      isPreparing: controller.transitionPhase === "preparing",
      mode,
    }),
    controller.releaseWindow
  );

  return (
    <div
      className="recording-overlay-root"
      data-anchor={surface?.anchor ?? "top"}
      data-hardware-notch={Boolean(surface?.notch)}
      data-presentation={surface?.presentation ?? "bar"}
      data-state={mode ?? "idle"}
      data-surface="notification"
      data-transition-error={controller.transitionError ?? undefined}
      onKeyDownCapture={controller.handleKeyDown}
    >
      <AnimatePresence onExitComplete={controller.releaseWindow}>
        {surface && mode ? (
          <IslandMorph
            contentKey={controller.contentKey}
            edge={
              mode === "recording"
                ? activityEdgeFor(controller.presentation.activityDecoration)
                : null
            }
            entry={notchEntry(surface)}
            key="notification"
            microphoneRef={controller.microphoneRef}
            mode={mode}
            onMorphComplete={controller.finishMorph}
            surface={surface}
          >
            <NotificationSurface controller={controller} mode={mode} />
          </IslandMorph>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default NotificationOverlay;
