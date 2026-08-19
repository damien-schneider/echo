import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import {
  HOVERED_ATTRIBUTE,
  hoverChainAt,
  hoverPaint,
} from "@/features/overlay-controls/runtime/native-hover";
import {
  OVERLAY_POINTER_EVENT,
  type OverlayPointer,
} from "@/features/overlay-controls/runtime/native-pointer";
import { listenCancellable } from "@/lib/tauri-listener";

/// CSS `:hover` never fires here — the overlay refuses the keyboard, so hover is painted from the native pointer.
export const useNativeHover = () => {
  useEffect(() => {
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
      listen<OverlayPointer>(OVERLAY_POINTER_EVENT, (event) =>
        paint(hoverChainAt(document, event.payload))
      )
    );
    return () => {
      paint([]);
      stopListening();
    };
  }, []);
};
