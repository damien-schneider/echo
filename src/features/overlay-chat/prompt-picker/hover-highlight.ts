import { listen } from "@tauri-apps/api/event";
import { NATIVE_HOVER_ATTRIBUTE } from "@/features/overlay-controls/runtime/native-hover";
import {
  OVERLAY_POINTER_EVENT,
  type OverlayPointer,
} from "@/features/overlay-controls/runtime/native-pointer";
import { listenCancellable } from "@/lib/tauri-listener";

const OPTION = '[role="option"]';

/// Only a moving pointer takes the highlight: native samples repeat while it rests, and options sliding under it stay with the keyboard.
export const hoverHighlightRef =
  (highlightAt: (index: number) => void) => (list: HTMLElement | null) => {
    if (list === null) {
      return;
    }
    const follow = (target: Element | null) => {
      const option = target?.closest(OPTION);
      const index = option
        ? Array.from(list.querySelectorAll(OPTION)).indexOf(option)
        : -1;
      if (index !== -1) {
        highlightAt(index);
      }
    };
    let resting: OverlayPointer | null = null;
    const stopListening = listenCancellable(() =>
      listen<OverlayPointer>(OVERLAY_POINTER_EVENT, ({ payload }) => {
        const moved =
          resting !== null &&
          (resting.x !== payload.x || resting.y !== payload.y);
        resting = payload;
        if (moved && payload.inside) {
          follow(document.elementFromPoint(payload.x, payload.y));
        }
      })
    );
    const move = (event: PointerEvent) => {
      const isNative = document.documentElement.hasAttribute(
        NATIVE_HOVER_ATTRIBUTE
      );
      if (!isNative && event.target instanceof Element) {
        follow(event.target);
      }
    };
    list.addEventListener("pointermove", move);
    return () => {
      stopListening();
      list.removeEventListener("pointermove", move);
    };
  };
