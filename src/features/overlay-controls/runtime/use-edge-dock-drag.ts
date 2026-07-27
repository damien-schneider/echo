import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  dockEdgeForKey,
  OVERLAY_DRAG_COMMAND,
  OVERLAY_DRAG_SETTLED_EVENT,
} from "@/features/overlay-controls/runtime/edge-dock-commands";
import { listenCancellable } from "@/lib/tauri-listener";

const invokeDrag = (command: string) => invoke(command).catch(() => undefined);

// the compositor swallows the mouse-up ending a native drag, so Rust reports the drop instead
export const useEdgeDockDrag = () => {
  const [isDragging, setIsDragging] = useState(false);
  const holdsGrip = useRef(false);

  const endDrag = () => {
    holdsGrip.current = false;
    setIsDragging(false);
  };

  const settleDrag = useEffectEvent(() => endDrag());
  const releasePointer = useEffectEvent(() => {
    if (!holdsGrip.current) {
      return;
    }
    endDrag();
    invokeDrag(OVERLAY_DRAG_COMMAND.snap);
  });
  const abandonDrag = useEffectEvent(() => {
    if (!holdsGrip.current) {
      return;
    }
    holdsGrip.current = false;
    invokeDrag(OVERLAY_DRAG_COMMAND.cancel);
  });

  useEffect(
    () =>
      listenCancellable(() =>
        listen(OVERLAY_DRAG_SETTLED_EVENT, () => settleDrag())
      ),
    []
  );

  useEffect(() => {
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    return () => {
      abandonDrag();
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
    };
  }, []);

  // a fresh press proves the previous release never reached the webview
  const onGripPointerDown = async (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    holdsGrip.current = true;
    setIsDragging(true);
    const previewing = await invoke(OVERLAY_DRAG_COMMAND.begin).then(
      () => true,
      () => false
    );
    if (!previewing) {
      endDrag();
      return;
    }
    // Release can beat the handshake: settle the session it just opened.
    if (!holdsGrip.current) {
      invokeDrag(OVERLAY_DRAG_COMMAND.snap);
      return;
    }
    try {
      await getCurrentWindow().startDragging();
    } catch {
      endDrag();
      invokeDrag(OVERLAY_DRAG_COMMAND.cancel);
    }
  };

  const onGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const edge = dockEdgeForKey(event.key);
    if (edge === null) {
      return;
    }
    event.preventDefault();
    invoke(OVERLAY_DRAG_COMMAND.setDockEdge, { edge }).catch(() => undefined);
  };

  return { isDragging, onGripKeyDown, onGripPointerDown };
};

export type EdgeDockDrag = ReturnType<typeof useEdgeDockDrag>;
