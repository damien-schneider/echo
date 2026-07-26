import {
  type OverlayControlAction,
  overlayControlCommand,
} from "@/overlay/overlay-controls";

interface InvokeOverlayControlOptions {
  action: OverlayControlAction;
  invokeCommand: (command: string) => Promise<unknown>;
}

const controlFailureMessages = {
  polish: "Couldn’t polish the selection. Try again.",
  start_recording: "Couldn’t start recording. Try again.",
  stop_recording: "Couldn’t stop recording. Try again.",
} satisfies Record<OverlayControlAction, string>;

export const controlFailureMessage = (action: OverlayControlAction) =>
  controlFailureMessages[action];

export const invokeOverlayControl = async ({
  action,
  invokeCommand,
}: InvokeOverlayControlOptions) => {
  try {
    await invokeCommand(overlayControlCommand(action));
    return null;
  } catch {
    return controlFailureMessage(action);
  }
};
