import { useEffect, useReducer, useState } from "react";
import {
  initialOverlayActivity,
  reduceOverlayActivity,
} from "@/features/overlay-controls/runtime/overlay-activity-state";
import { hudEventRegistrations } from "@/features/overlay-controls/runtime/overlay-event-registrations";
import {
  initialSurfaceState,
  startOverlaySubscription,
} from "@/features/overlay-controls/runtime/overlay-subscription";
import { viewportOverlaySurface } from "@/features/overlay-controls/runtime/overlay-surface";
import { HUD_WINDOW } from "@/features/overlay-controls/runtime/overlay-windows";

const viewportSurface = () =>
  viewportOverlaySurface({
    height: window.innerHeight,
    width: window.innerWidth,
  });

/// The HUD listens to the activity stream only to know whether an operation is
/// running — the words themselves belong to the notification window.
export const useHudEvents = () => {
  const [activity, dispatch] = useReducer(
    reduceOverlayActivity,
    initialOverlayActivity
  );
  const [surfaceState, setSurfaceState] = useState(initialSurfaceState);

  useEffect(
    () =>
      startOverlaySubscription({
        channel: HUD_WINDOW,
        dispatch,
        onFallback: viewportSurface,
        registrations: (onSurface) =>
          hudEventRegistrations({
            dispatch,
            onSurface,
            surfaceEvent: HUD_WINDOW.surfaceEvent,
          }),
        setSurface: setSurfaceState,
      }),
    []
  );

  return {
    isSurfaceReady: surfaceState.isReady,
    isVisible: activity.isVisible,
    state: activity.state,
    surface: surfaceState.surface,
  };
};
