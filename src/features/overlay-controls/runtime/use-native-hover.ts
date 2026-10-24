import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import {
  HOVERED_ATTRIBUTE,
  hoverChainAt,
  hoverPaint,
  NATIVE_HOVER_ATTRIBUTE,
} from "@/features/overlay-controls/runtime/native-hover";
import {
  OVERLAY_POINTER_EVENT,
  type OverlayPointer,
} from "@/features/overlay-controls/runtime/native-pointer";
import { listenCancellable } from "@/lib/tauri-listener";

/// WebKit's own `:hover` trails the pointer by ~400 ms in a panel that refuses the keyboard — once native samples flow, they alone paint hover.
export const useNativeHover = () => {
  useEffect(() => {
    const root = document.documentElement;
    let painted: Element[] = [];
    const paint = (next: Element[]) => {
      const { enter, leave } = hoverPaint(painted, next);
      for (const element of leave) {
        element.removeAttribute(HOVERED_ATTRIBUTE);
      }
      for (const element of enter) {
        element.setAttribute(HOVERED_ATTRIBUTE, "");
      }
      painted = next;
    };
    const stopListening = listenCancellable(() =>
      listen<OverlayPointer>(OVERLAY_POINTER_EVENT, (event) => {
        root.toggleAttribute(NATIVE_HOVER_ATTRIBUTE, true);
        paint(hoverChainAt(document, event.payload));
      })
    );
    return () => {
      paint([]);
      root.removeAttribute(NATIVE_HOVER_ATTRIBUTE);
      stopListening();
    };
  }, []);
};
