import { useLayoutEffect, useState } from "react";
import type { IslandSize } from "@/features/overlay-controls/runtime/overlay-surface";

const readIslandSize = (element: HTMLElement): IslandSize => ({
  height: element.offsetHeight,
  width: element.offsetWidth,
});

const sizesMatch = (current: IslandSize | null, next: IslandSize) =>
  current !== null &&
  current.height === next.height &&
  current.width === next.width;

// content-sized surfaces know their size only once laid out — Rust's box is the upper bound
export const useMeasuredIslandSize = () => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<IslandSize | null>(null);
  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    const measure = () => {
      const next = readIslandSize(element);
      setSize((current) => (sizesMatch(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { measurementRef: setElement, size };
};
