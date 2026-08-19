// from the Rust pointer monitors — a keyboard-free panel gets no pointer events from WebKit at all
export const OVERLAY_POINTER_EVENT = "overlay-pointer";

/// Window-local CSS pixels, so the page can hit-test with it directly.
export interface OverlayPointer {
  inside: boolean;
  x: number;
  y: number;
}
