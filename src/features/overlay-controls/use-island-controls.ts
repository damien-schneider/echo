import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { polishControlIntent } from "@/features/overlay-controls/recording-overlay-state";
import { invokeOverlayControl } from "@/features/overlay-controls/runtime/control-invocation";
import {
  beginIslandCollapse,
  finishIslandCollapse,
  initialIslandControlMotionState,
  revealIslandControls,
} from "@/features/overlay-controls/runtime/island-control-state";
import {
  NOTIFICATION_REQUEST_COMMAND,
  type NotificationRequest,
  OVERLAY_WARNING_COMMAND,
} from "@/features/overlay-controls/runtime/overlay-windows";
import type { PolishStatus } from "@/lib/types";
import type { OverlayControlAction } from "@/overlay/overlay-controls";

interface IslandControlOptions {
  isRecording: boolean;
  polishStatus: PolishStatus;
}

/// Chat and the model panel are drawn by the notification window — the HUD only asks Rust.
const requestNotification = (surface: NotificationRequest) =>
  invoke(NOTIFICATION_REQUEST_COMMAND, { surface }).catch(() => undefined);

const useIslandSurface = () => {
  const [surface, setSurface] = useState(initialIslandControlMotionState);
  return {
    collapseControls: () => setSurface(beginIslandCollapse),
    dismissControls: () => setSurface(initialIslandControlMotionState),
    finishCollapse: () => setSurface(finishIslandCollapse),
    showControls: () => setSurface(revealIslandControls),
    surface,
  };
};

/// A handle a few pixels tall has nowhere to speak — failures go to the notification window.
const useControlInvocation = () => {
  const invocationGeneration = useRef(0);
  return async (action: OverlayControlAction) => {
    invocationGeneration.current += 1;
    const generation = invocationGeneration.current;
    const actionError = await invokeOverlayControl({
      action,
      invokeCommand: (command) => invoke(command),
    });
    if (actionError && generation === invocationGeneration.current) {
      invoke(OVERLAY_WARNING_COMMAND, { message: actionError }).catch(
        () => undefined
      );
    }
  };
};

export const useIslandControls = ({
  isRecording,
  polishStatus,
}: IslandControlOptions) => {
  const island = useIslandSurface();
  const invokeControl = useControlInvocation();
  const openChat = () => {
    island.dismissControls();
    requestNotification("chat");
  };
  const polish = () => {
    if (polishControlIntent(polishStatus) === "run") {
      return invokeControl("polish");
    }
    island.dismissControls();
    requestNotification("panel");
  };

  return {
    collapseControls: island.collapseControls,
    dismissControls: island.dismissControls,
    finishCollapse: island.finishCollapse,
    isControlsOpen: island.surface.isControlsOpen,
    motionPhase: island.surface.motionPhase,
    openChat,
    polish,
    showControls: island.showControls,
    toggleRecording: () =>
      invokeControl(isRecording ? "stop_recording" : "start_recording"),
  };
};
