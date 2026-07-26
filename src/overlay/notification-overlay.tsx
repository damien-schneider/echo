import "@/overlay/recording-overlay.css";
import { AnimatePresence } from "motion/react";
import { useEffect, useEffectEvent } from "react";
import { IslandMorph } from "@/features/overlay-controls/motion/island-morph";
import { notchEntry } from "@/features/overlay-controls/motion/notch-entry";
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

/// The window that opens at the notch. It knows nothing about where the HUD
/// sits, so there is no transition between the two — this surface simply grows
/// out of the notch and folds back into it.
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
            entry={notchEntry(surface)}
            key="notification"
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
