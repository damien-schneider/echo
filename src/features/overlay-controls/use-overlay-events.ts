import { type RefObject, useEffect, useReducer, useState } from "react";
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

/// Activity, transcript, microphone level and model downloads all arrive here.
export const useOverlayEvents = (
  microphoneRef: RefObject<HTMLSpanElement | null>
) => {
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
            microphoneRef,
            onSurface,
            surfaceEvent: NOTIFICATION_WINDOW.surfaceEvent,
          }),
        setSurface: setSurfaceState,
      }),
    [microphoneRef]
  );

  return {
    dismissPassiveActivity: () => dispatch({ type: "dismissed" }),
    download: activity.download,
    eventError: activity.error,
    isSurfaceReady: surfaceState.isReady,
    isVisible: activity.isVisible,
    state: activity.state,
    streamingText: activity.streamingText,
    surface: surfaceState.surface,
    warningMessage: activity.warningMessage,
  };
};
