import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  previewFrameVars,
  previewGlides,
  type SnapPreviewPayload,
  SnapPreviewPayloadSchema,
} from "@/overlay/snap-preview-frame";
import "@/overlay/snap-preview.css";

const GLIDE_SETTLE_MS = 220;
const DISMISS_FADE_MS = 140;

const preview = document.querySelector<HTMLElement>(".echo-snap-preview");

let painted: SnapPreviewPayload | null = null;
let pending: SnapPreviewPayload | null = null;
let paintHandle: number | null = null;
let glideTimer: number | null = null;
let hideTimer: number | null = null;

const cancelGlide = () => {
  if (glideTimer !== null) {
    window.clearTimeout(glideTimer);
    glideTimer = null;
  }
};

const cancelHide = () => {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
};

const cancelPaint = () => {
  if (paintHandle !== null) {
    window.cancelAnimationFrame(paintHandle);
    paintHandle = null;
  }
  pending = null;
};

const glideToNewEdge = (element: HTMLElement) => {
  cancelGlide();
  element.dataset.glide = "true";
  glideTimer = window.setTimeout(() => {
    glideTimer = null;
    element.dataset.glide = "false";
  }, GLIDE_SETTLE_MS);
};

const paint = () => {
  paintHandle = null;
  const next = pending;
  pending = null;
  if (!(preview && next)) {
    return;
  }
  if (previewGlides(painted, next)) {
    glideToNewEdge(preview);
  }
  painted = next;
  preview.dataset.anchor = next.anchor;
  preview.dataset.state = "visible";
  for (const [property, value] of Object.entries(previewFrameVars(next))) {
    preview.style.setProperty(property, value);
  }
};

// Native pointer samples outrun the compositor: one paint per frame, latest wins.
const schedulePaint = (payload: SnapPreviewPayload) => {
  cancelHide();
  pending = payload;
  paintHandle ??= window.requestAnimationFrame(paint);
};

const dismiss = () => {
  if (!preview) {
    return;
  }
  cancelPaint();
  cancelHide();
  painted = null;
  preview.dataset.state = "committed";
  hideTimer = window.setTimeout(() => {
    hideTimer = null;
    preview.dataset.state = "hidden";
    getCurrentWindow()
      .hide()
      .catch(() => undefined);
  }, DISMISS_FADE_MS);
};

await Promise.all([
  listen("overlay-snap-preview", ({ payload }) => {
    const parsed = SnapPreviewPayloadSchema.safeParse(payload);
    if (parsed.success) {
      schedulePaint(parsed.data);
    }
  }),
  listen("overlay-snap-preview-dismiss", dismiss),
]);
