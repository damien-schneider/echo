import type { MotionValue } from "motion/react";
import { useEffect, useReducer, useState } from "react";
import {
  initialOverlayActivity,
  reduceOverlayActivity,
} from "@/features/overlay-controls/runtime/overlay-activity-state";
import { overlayEventRegistrations } from "@/features/overlay-controls/runtime/overlay-event-registrations";
import {
  initialSurfaceState,
  startOverlaySubscription,
} from "@/features/overlay-controls/runtime/overlay-subscription";
import { viewportOverlaySurface } from "@/features/overlay-controls/runtime/overlay-surface";
import { NOTIFICATION_WINDOW } from "@/features/overlay-controls/runtime/overlay-windows";

const viewportSurface = () =>
  viewportOverlaySurface({
    height: window.innerHeight,
    width: window.innerWidth,
  });

export const useOverlayEvents = (voice: MotionValue<number>) => {
  const [activity, dispatch] = useReducer(
    reduceOverlayActivity,
    initialOverlayActivity
  );
  const [surfaceState, setSurfaceState] = useState(initialSurfaceState);

  useEffect(
    () =>
      startOverlaySubscription({
        channel: NOTIFICATION_WINDOW,
        dispatch,
        onFallback: viewportSurface,
        registrations: (onSurface) =>
          overlayEventRegistrations({
            dispatch,
            onSurface,
            surfaceEvent: NOTIFICATION_WINDOW.surfaceEvent,
            voice,
          }),
        setSurface: setSurfaceState,
      }),
    [voice]
  );

  return {
    dismissPassiveActivity: () => dispatch({ type: "dismissed" }),
    download: activity.download,
    eventError: activity.error,
    isSurfaceReady: surfaceState.isReady,
    isVisible: activity.isVisible,
    remedy: activity.remedy,
    state: activity.state,
    streamingText: activity.streamingText,
    surface: surfaceState.surface,
    warningMessage: activity.warningMessage,
  };
};
