import { describe, expect, test } from "bun:test";
import {
  boundaryToHoverEvent,
  initialResidentHoverSources,
  reduceResidentHover,
} from "@/features/overlay-controls/runtime/resident-hover";

describe("resident hover", () => {
  test("DOM leave recovers when the native exit sample is missed", () => {
    const nativeInside = reduceResidentHover(initialResidentHoverSources, {
      inside: true,
      type: "native-pointer-boundary",
    });
    const domLeft = reduceResidentHover(nativeInside.sources, {
      type: "dom-pointer-leave",
    });

    expect(nativeInside.intent).toBe("reveal");
    expect(domLeft.intent).toBe("collapse");
    expect(domLeft.sources.nativePointer).toBeNull();
  });

  test("native exit collapses without a focus hold", () => {
    const nativeInside = reduceResidentHover(initialResidentHoverSources, {
      inside: true,
      type: "native-pointer-boundary",
    });
    const nativeOutside = reduceResidentHover(nativeInside.sources, {
      inside: false,
      type: "native-pointer-boundary",
    });

    expect(nativeOutside.intent).toBe("collapse");
    expect(nativeOutside.sources.nativePointer).toBe(false);
  });

  test("focus-visible holds the controls open after native exit", () => {
    const nativeInside = reduceResidentHover(initialResidentHoverSources, {
      inside: true,
      type: "native-pointer-boundary",
    });
    const focused = reduceResidentHover(nativeInside.sources, {
      type: "focus-visible",
    });
    const nativeOutside = reduceResidentHover(focused.sources, {
      inside: false,
      type: "native-pointer-boundary",
    });

    expect(nativeOutside.intent).toBeNull();
    expect(nativeOutside.sources.focus).toBe(true);
  });

  test("DOM-only entry and exit reveal then collapse", () => {
    const entered = reduceResidentHover(initialResidentHoverSources, {
      type: "dom-pointer-enter",
    });
    const left = reduceResidentHover(entered.sources, {
      type: "dom-pointer-leave",
    });

    expect(entered.intent).toBe("reveal");
    expect(entered.sources.domPointer).toBe(true);
    expect(left.intent).toBe("collapse");
    expect(left.sources).toEqual(initialResidentHoverSources);
  });

  test("DOM entry recovers after a stale native exit", () => {
    const nativeOutside = reduceResidentHover(initialResidentHoverSources, {
      inside: false,
      type: "native-pointer-boundary",
    });
    const domEntered = reduceResidentHover(nativeOutside.sources, {
      type: "dom-pointer-enter",
    });
    const domLeft = reduceResidentHover(domEntered.sources, {
      type: "dom-pointer-leave",
    });

    expect(domEntered.intent).toBe("reveal");
    expect(domEntered.sources.nativePointer).toBeNull();
    expect(domLeft.intent).toBe("collapse");
  });

  test("losing focus collapses only without effective pointer possession", () => {
    const focused = reduceResidentHover(initialResidentHoverSources, {
      type: "focus-visible",
    });
    const blurred = reduceResidentHover(focused.sources, {
      type: "focus-lost",
    });
    expect(blurred.intent).toBe("collapse");

    const nativeInside = reduceResidentHover(initialResidentHoverSources, {
      inside: true,
      type: "native-pointer-boundary",
    });
    const focusedInside = reduceResidentHover(nativeInside.sources, {
      type: "focus-visible",
    });
    const blurredInside = reduceResidentHover(focusedInside.sources, {
      type: "focus-lost",
    });
    expect(blurredInside.intent).toBeNull();
  });

  test("pointer down clears the focus hold without collapsing", () => {
    const focused = reduceResidentHover(initialResidentHoverSources, {
      type: "focus-visible",
    });
    const pressed = reduceResidentHover(focused.sources, {
      type: "pointer-down",
    });

    expect(pressed.intent).toBeNull();
    expect(pressed.sources.focus).toBe(false);
  });

  test("repeated pointer entry always cancels a closing phase", () => {
    const entered = reduceResidentHover(initialResidentHoverSources, {
      type: "dom-pointer-enter",
    });
    const reentered = reduceResidentHover(entered.sources, {
      type: "dom-pointer-enter",
    });

    expect(reentered.intent).toBe("reveal");
  });

  test("native boundary payload maps to the native pointer source", () => {
    expect(boundaryToHoverEvent(true)).toEqual({
      inside: true,
      type: "native-pointer-boundary",
    });
    expect(boundaryToHoverEvent(false)).toEqual({
      inside: false,
      type: "native-pointer-boundary",
    });
  });
});
