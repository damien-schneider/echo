import { listen } from "@tauri-apps/api/event";
import {
  type FocusEvent,
  type PointerEvent,
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
import type { OverlayAnchor } from "@/features/overlay-controls/runtime/overlay-surface";
import {
  boundaryToHoverEvent,
  initialResidentHoverSources,
  type ResidentHoverEvent,
  reduceResidentHover,
} from "@/features/overlay-controls/runtime/resident-hover";
import { listenCancellable } from "@/lib/tauri-listener";

type PointerPoint = Pick<MouseEvent, "clientX" | "clientY">;

// a floating dock also owns the gap to its screen edge — mirrors surface_hover_box
const isWithinReach = (
  resident: HTMLElement,
  anchor: OverlayAnchor | undefined,
  { clientX, clientY }: PointerPoint
) => {
  const bounds = resident.getBoundingClientRect();
  const left = anchor === "left" ? 0 : bounds.left;
  const right = anchor === "right" ? window.innerWidth : bounds.right;
  const top = anchor === "top" ? 0 : bounds.top;
  const bottom = anchor === "bottom" ? window.innerHeight : bounds.bottom;
  return (
    clientX >= left && clientX < right && clientY >= top && clientY < bottom
  );
};

interface ResidentPointerExitOptions {
  anchor: OverlayAnchor | undefined;
  isExpanded: boolean;
  onDomLeave: () => void;
  residentRef: RefObject<HTMLDivElement | null>;
}

// DOM fallback for platforms with no native boundary event; macOS uses the native one
const useResidentPointerExit = ({
  anchor,
  isExpanded,
  onDomLeave,
  residentRef,
}: ResidentPointerExitOptions) => {
  const handlePointerMove = useEffectEvent((event: globalThis.PointerEvent) => {
    const resident = residentRef.current;
    if (resident && !isWithinReach(resident, anchor, event)) {
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
  anchor: OverlayAnchor | undefined;
  isExpanded: boolean;
  onCollapse: () => void;
  onReveal: () => void;
  residentRef: RefObject<HTMLDivElement | null>;
}

export interface ResidentHover {
  isActive: boolean;
  onBlurCapture: (event: FocusEvent<HTMLDivElement>) => void;
  onFocusCapture: (event: FocusEvent<HTMLDivElement>) => void;
  onPointerDownCapture: () => void;
  onPointerEnter: () => void;
  onPointerLeave: (event: PointerEvent<HTMLDivElement>) => void;
  onTriggerPointerEnter: () => void;
}

export const useResidentHover = ({
  anchor,
  isExpanded,
  onCollapse,
  onReveal,
  residentRef,
}: ResidentHoverOptions): ResidentHover => {
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
    anchor,
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
    onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
      if (!isWithinReach(event.currentTarget, anchor, event)) {
        dispatch({ type: "dom-pointer-leave" });
      }
    },
    onTriggerPointerEnter: () => dispatch({ type: "dom-pointer-enter" }),
  };
};
