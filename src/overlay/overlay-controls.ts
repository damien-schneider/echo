const overlayControlCommands = {
  polish: "run_polish_from_overlay",
  start_recording: "start_transcription_from_overlay",
  stop_recording: "stop_transcription_from_overlay",
} as const;

export type OverlayControlAction = keyof typeof overlayControlCommands;

export const overlayControlCommand = (action: OverlayControlAction) =>
  overlayControlCommands[action];
