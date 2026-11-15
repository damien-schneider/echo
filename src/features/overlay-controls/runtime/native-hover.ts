export const HOVERED_ATTRIBUTE = "data-hovered";
export const NATIVE_HOVER_ATTRIBUTE = "data-native-hover";

/// What CSS would mark as `:hover` — the element under the pointer and everything it sits inside.
export const hoverChainAt = <Target>(
  document: { elementsFromPoint: (x: number, y: number) => Target[] },
  point: { inside: boolean; x: number; y: number }
): Target[] =>
  point.inside ? document.elementsFromPoint(point.x, point.y) : [];

interface HoverPaint<Target> {
  enter: Target[];
  leave: Target[];
}

export const hoverPaint = <Target>(
  painted: readonly Target[],
  next: readonly Target[]
): HoverPaint<Target> => ({
  enter: next.filter((element) => !painted.includes(element)),
  leave: painted.filter((element) => !next.includes(element)),
});
