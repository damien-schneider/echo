import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import {
  OVERLAY_MENU_COMMAND,
  OVERLAY_WARNING_COMMAND,
} from "@/features/overlay-controls/runtime/overlay-windows";
import { errorMessage } from "@/lib/utils";

/// The webview's own right-click menu offers a page reload — the HUD offers the app instead.
export const useOverlayMenu = () => {
  useEffect(() => {
    const openMenu = (event: MouseEvent) => {
      event.preventDefault();
      invoke(OVERLAY_MENU_COMMAND).catch((error: unknown) => {
        invoke(OVERLAY_WARNING_COMMAND, {
          message: errorMessage(error, "The overlay menu could not open"),
        }).catch(() => undefined);
      });
    };
    document.addEventListener("contextmenu", openMenu);
    return () => {
      document.removeEventListener("contextmenu", openMenu);
    };
  }, []);
};
