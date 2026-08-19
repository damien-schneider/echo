import { listen } from "@tauri-apps/api/event";
import {
  type FocusEvent,
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  OVERLAY_POINTER_EVENT,
  type OverlayPointer,
} from "@/features/overlay-controls/runtime/native-pointer";
import {
  boundaryToHoverEvent,
  initialResidentHoverSources,
  type ResidentHoverEvent,
  reduceResidentHover,
} from "@/features/overlay-controls/runtime/resident-hover";
import { listenCancellable } from "@/lib/tauri-listener";

interface ResidentPointerExitOptions {
  isExpanded: boolean;
  onDomLeave: () => void;
  residentRef: RefObject<HTMLDivElement | null>;
}

// DOM fallback for platforms with no native boundary event; macOS uses the native one
const useResidentPointerExit = ({
  isExpanded,
  onDomLeave,
  residentRef,
}: ResidentPointerExitOptions) => {
  const handlePointerMove = useEffectEvent((event: globalThis.PointerEvent) => {
    const resident = residentRef.current;
    if (!resident) {
      return;
    }
    const bounds = resident.getBoundingClientRect();
    const pointerInside =
      event.clientX >= bounds.left &&
      event.clientX < bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY < bounds.bottom;
    if (!pointerInside) {
      onDomLeave();
    }
  });
  useEffect(() => {
    if (!isExpanded) {
      return;
    }
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [isExpanded]);
};

// authoritative on macOS — the DOM never sees the pointer, so only the crossings this reports move the island
const useNativePointerBoundary = (
  dispatch: (event: ResidentHoverEvent) => void
) => {
  const wasInside = useRef<boolean | null>(null);
  const onBoundary = useEffectEvent((inside: boolean) => {
    if (wasInside.current === inside) {
      return;
    }
    wasInside.current = inside;
    dispatch(boundaryToHoverEvent(inside));
  });
  useEffect(
    () =>
      listenCancellable(() =>
        listen<OverlayPointer>(OVERLAY_POINTER_EVENT, (event) =>
          onBoundary(event.payload.inside)
        )
      ),
    []
  );
};

interface ResidentHoverOptions {
  isExpanded: boolean;
  onCollapse: () => void;
  onReveal: () => void;
  residentRef: RefObject<HTMLDivElement | null>;
}

export const useResidentHover = ({
  isExpanded,
  onCollapse,
  onReveal,
  residentRef,
}: ResidentHoverOptions) => {
  const sources = useRef(initialResidentHoverSources);
  const [isActive, setIsActive] = useState(false);
  const dispatch = (event: ResidentHoverEvent) => {
    const { intent, sources: next } = reduceResidentHover(
      sources.current,
      event
    );
    sources.current = next;
    setIsActive((next.nativePointer ?? next.domPointer) || next.focus);
    if (intent === "reveal") {
      onReveal();
      return;
    }
    if (intent === "collapse") {
      onCollapse();
    }
  };
  useNativePointerBoundary(dispatch);
  useResidentPointerExit({
    isExpanded: isExpanded || isActive,
    onDomLeave: () => dispatch({ type: "dom-pointer-leave" }),
    residentRef,
  });

  return {
    isActive,
    onBlurCapture: (event: FocusEvent<HTMLDivElement>) => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      dispatch({ type: "focus-lost" });
    },
    onFocusCapture: (event: FocusEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.matches(":focus-visible")
      ) {
        dispatch({ type: "focus-visible" });
      }
    },
    onPointerDownCapture: () => dispatch({ type: "pointer-down" }),
    onPointerEnter: () => dispatch({ type: "dom-pointer-enter" }),
    onPointerLeave: () => dispatch({ type: "dom-pointer-leave" }),
    onTriggerPointerEnter: () => dispatch({ type: "dom-pointer-enter" }),
  };
};
