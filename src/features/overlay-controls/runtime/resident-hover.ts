export interface ResidentHoverSources {
  domPointer: boolean;
  focus: boolean;
  nativePointer: boolean | null;
}

export type ResidentHoverEvent =
  | { type: "dom-pointer-enter" }
  | { type: "dom-pointer-leave" }
  | { type: "focus-lost" }
  | { type: "focus-visible" }
  | { type: "native-pointer-boundary"; inside: boolean }
  | { type: "pointer-down" };

export type ResidentHoverIntent = "collapse" | "reveal" | null;

export interface ResidentHoverTransition {
  intent: ResidentHoverIntent;
  sources: ResidentHoverSources;
}

export const initialResidentHoverSources: ResidentHoverSources = {
  domPointer: false,
  focus: false,
  nativePointer: null,
};

export const boundaryToHoverEvent = (inside: boolean): ResidentHoverEvent => ({
  inside,
  type: "native-pointer-boundary",
});

const effectivePointer = (sources: ResidentHoverSources) =>
  sources.nativePointer ?? sources.domPointer;

const pointerLeaveTransition = (
  sources: ResidentHoverSources,
  next: ResidentHoverSources
): ResidentHoverTransition => ({
  intent:
    effectivePointer(sources) && !effectivePointer(next) && !next.focus
      ? "collapse"
      : null,
  sources: next,
});

export const reduceResidentHover = (
  sources: ResidentHoverSources,
  event: ResidentHoverEvent
): ResidentHoverTransition => {
  switch (event.type) {
    case "dom-pointer-enter":
      return {
        intent: "reveal",
        sources: { ...sources, domPointer: true, nativePointer: null },
      };
    case "dom-pointer-leave":
      return pointerLeaveTransition(sources, {
        ...sources,
        domPointer: false,
        nativePointer: null,
      });
    case "focus-lost": {
      if (!sources.focus) {
        return { intent: null, sources };
      }
      const next = { ...sources, focus: false };
      return {
        intent: effectivePointer(next) ? null : "collapse",
        sources: next,
      };
    }
    case "focus-visible":
      return { intent: "reveal", sources: { ...sources, focus: true } };
    case "native-pointer-boundary": {
      const next = { ...sources, nativePointer: event.inside };
      if (event.inside) {
        return { intent: "reveal", sources: next };
      }
      return pointerLeaveTransition(sources, next);
    }
    case "pointer-down":
      return { intent: null, sources: { ...sources, focus: false } };
    default:
      return { intent: null, sources };
  }
};
