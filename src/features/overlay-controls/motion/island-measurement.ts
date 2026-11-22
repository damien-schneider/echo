import { useLayoutEffect, useState } from "react";
import type { IslandCornerRadii } from "@/features/overlay-controls/motion/island-corners";
import type { IslandSize } from "@/features/overlay-controls/runtime/overlay-surface";

export interface IslandMeasurement {
  /// The content root's own corners — the island wears them so whatever sits in a corner stays concentric.
  corners: IslandCornerRadii | null;
  size: IslandSize;
}

const readCorners = (root: Element | null): IslandCornerRadii | null => {
  if (!root) {
    return null;
  }
  const style = getComputedStyle(root);
  return {
    borderBottomLeftRadius: Number.parseFloat(style.borderBottomLeftRadius),
    borderBottomRightRadius: Number.parseFloat(style.borderBottomRightRadius),
    borderTopLeftRadius: Number.parseFloat(style.borderTopLeftRadius),
    borderTopRightRadius: Number.parseFloat(style.borderTopRightRadius),
  };
};

const readIsland = (element: HTMLElement): IslandMeasurement => ({
  corners: readCorners(element.firstElementChild),
  size: { height: element.offsetHeight, width: element.offsetWidth },
});

const cornersMatch = (
  current: IslandCornerRadii | null,
  next: IslandCornerRadii | null
) =>
  current === next ||
  (current !== null &&
    next !== null &&
    current.borderBottomLeftRadius === next.borderBottomLeftRadius &&
    current.borderBottomRightRadius === next.borderBottomRightRadius &&
    current.borderTopLeftRadius === next.borderTopLeftRadius &&
    current.borderTopRightRadius === next.borderTopRightRadius);

const measurementsMatch = (
  current: IslandMeasurement | null,
  next: IslandMeasurement
) =>
  current !== null &&
  current.size.height === next.size.height &&
  current.size.width === next.size.width &&
  cornersMatch(current.corners, next.corners);

// content-sized surfaces know their size only once laid out — Rust's box is the upper bound
export const useMeasuredIsland = () => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [measurement, setMeasurement] = useState<IslandMeasurement | null>(
    null
  );
  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    const measure = () => {
      const next = readIsland(element);
      setMeasurement((current) =>
        measurementsMatch(current, next) ? current : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { measurement, measurementRef: setElement };
};
