import type { OverlayAnchor } from "@/features/overlay-controls/runtime/overlay-surface";

export const OVERLAY_DRAG_COMMAND = {
  begin: "begin_recording_overlay_snap_preview",
  cancel: "cancel_recording_overlay_snap_preview",
  setDockEdge: "set_recording_overlay_dock_edge",
  snap: "snap_recording_overlay_to_nearest_edge",
} as const;

export type OverlayDragCommand =
  (typeof OVERLAY_DRAG_COMMAND)[keyof typeof OVERLAY_DRAG_COMMAND];

/// Native mouse-up owns the drop: the webview never sees it mid-drag.
export const OVERLAY_DRAG_SETTLED_EVENT = "overlay-drag-settled";

const ARROW_DOCK_EDGE = {
  ArrowDown: "bottom",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "top",
} as const satisfies Record<string, OverlayAnchor>;

type ArrowKey = keyof typeof ARROW_DOCK_EDGE;

const isArrowKey = (key: string): key is ArrowKey =>
  Object.hasOwn(ARROW_DOCK_EDGE, key);

export const dockEdgeForKey = (key: string): OverlayAnchor | null =>
  isArrowKey(key) ? ARROW_DOCK_EDGE[key] : null;
