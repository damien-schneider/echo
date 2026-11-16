import { invoke } from "@tauri-apps/api/core";
import { type RefObject, useEffect, useRef } from "react";
import { OVERLAY_WARNING_COMMAND } from "@/features/overlay-controls/runtime/overlay-windows";

const OVERLAY_KEY_COMMAND = {
  hold: "hold_overlay_key",
  release: "release_overlay_key",
} as const;

type OverlayKey = "cancel" | "finish";

const keyFailureMessages = {
  cancel: "Escape isn’t available. Use the buttons on the island.",
  finish: "Enter isn’t available. Use the buttons on the island.",
} satisfies Record<OverlayKey, string>;

/// The warning takes the island, which drops and retakes the key — warning on every retry would never end.
const holdKey = async (key: OverlayKey, hasWarned: RefObject<boolean>) => {
  try {
    await invoke(OVERLAY_KEY_COMMAND.hold, { key });
    hasWarned.current = false;
  } catch {
    if (hasWarned.current) {
      return;
    }
    hasWarned.current = true;
    await invoke(OVERLAY_WARNING_COMMAND, { message: keyFailureMessages[key] });
  }
};

/// Borrowed from the focused app only while the overlay can act on the key, and handed straight back after.
export const useOverlayKey = (key: OverlayKey, isHeld: boolean) => {
  const hasWarned = useRef(false);
  useEffect(() => {
    const settled = isHeld
      ? holdKey(key, hasWarned)
      : invoke(OVERLAY_KEY_COMMAND.release, { key });
    settled.catch(() => undefined);
    return () => {
      invoke(OVERLAY_KEY_COMMAND.release, { key }).catch(() => undefined);
    };
  }, [isHeld, key]);
};
