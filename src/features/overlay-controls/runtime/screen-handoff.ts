import type { CSSProperties } from "react";

/// Rust asks before it teleports the HUD window to the cursor's display.
export const SCREEN_HANDOFF_EVENT = "overlay-screen-handoff";
export const SCREEN_HANDOFF_COMMAND = "move_recording_overlay_to_cursor_screen";

export const SCREEN_HANDOFF_FADE_MS = 130;
/// Arriving outlasts leaving: the fade in covers the repaint on the new screen.
export const SCREEN_HANDOFF_ARRIVAL_MS = 260;

export type ScreenHandoffPhase = "arriving" | "idle" | "leaving";

interface ScreenHandoffStyle extends CSSProperties {
  "--echo-handoff-arrival": string;
  "--echo-handoff-fade": string;
}

export const SCREEN_HANDOFF_STYLE: ScreenHandoffStyle = {
  "--echo-handoff-arrival": `${SCREEN_HANDOFF_ARRIVAL_MS}ms`,
  "--echo-handoff-fade": `${SCREEN_HANDOFF_FADE_MS}ms`,
};

// The window jumps displays in one step: a spring would fly the island across
// the gap it never travelled.
export const screenHandoffFreezesLayout = (phase: ScreenHandoffPhase) =>
  phase !== "idle";
