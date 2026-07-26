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
  boundaryToHoverEvent,
  initialResidentHoverSources,
  OVERLAY_POINTER_BOUNDARY_EVENT,
  type ResidentHoverEvent,
  reduceResidentHover,
} from "@/features/overlay-controls/runtime/resident-hover";
import { listenCancellable } from "@/lib/tauri-listener";

interface ResidentPointerExitOptions {
  isExpanded: boolean;
  onDomLeave: () => void;
  residentRef: RefObject<HTMLDivElement | null>;
}

// Native events own the boundary on macOS. This window-level geometry check
// is the DOM fallback for platforms where no native boundary event arrives.
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

// Native boundary samples from the Rust hover monitors are authoritative on
// macOS: the DOM sees no pointer until the panel becomes key, and WebKit
// reports nothing further until the pointer moves again.
const useNativePointerBoundary = (
  dispatch: (event: ResidentHoverEvent) => void
) => {
  const onBoundary = useEffectEvent((inside: boolean) => {
    dispatch(boundaryToHoverEvent(inside));
  });
  useEffect(
    () =>
      listenCancellable(() =>
        listen<boolean>(OVERLAY_POINTER_BOUNDARY_EVENT, (event) =>
          onBoundary(event.payload)
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
