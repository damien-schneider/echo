export const HOVERED_ATTRIBUTE = "data-hovered";

/// What CSS would mark as `:hover` — the element under the pointer and everything it sits inside.
export const hoverChainAt = (
  document: Pick<Document, "elementsFromPoint">,
  point: { inside: boolean; x: number; y: number }
): Element[] =>
  point.inside ? document.elementsFromPoint(point.x, point.y) : [];

interface HoverPaint {
  enter: Element[];
  leave: Element[];
}

export const hoverPaint = (
  painted: readonly Element[],
  next: readonly Element[]
): HoverPaint => ({
  enter: next.filter((element) => !painted.includes(element)),
  leave: painted.filter((element) => !next.includes(element)),
});
