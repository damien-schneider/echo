import { z } from "zod";
import {
  dockShoulder,
  dockSilhouettePath,
} from "@/features/overlay-controls/motion/dock-silhouette";
import { PILL_RADIUS } from "@/features/overlay-controls/motion/island-corners";

export const SnapPreviewPayloadSchema = z
  .object({
    anchor: z.enum(["bottom", "left", "right", "top"]),
    height: z.number().finite().nonnegative(),
    width: z.number().finite().nonnegative(),
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

export type SnapPreviewPayload = z.infer<typeof SnapPreviewPayloadSchema>;

export const previewFrameVars = (payload: SnapPreviewPayload) => ({
  "--preview-clip": dockSilhouettePath({
    anchor: payload.anchor,
    corner: PILL_RADIUS,
    gear: { revealed: false },
    height: payload.height,
    shoulder: dockShoulder({ anchor: payload.anchor, presentation: "docked" }),
    width: payload.width,
  }),
  "--preview-height": `${payload.height}px`,
  "--preview-width": `${payload.width}px`,
  "--preview-x": `${payload.x}px`,
  "--preview-y": `${payload.y}px`,
});

// along one edge the placeholder tracks the pointer 1:1 — a restarted transition reads as stutter
export const previewGlides = (
  painted: SnapPreviewPayload | null,
  next: SnapPreviewPayload
) => painted !== null && painted.anchor !== next.anchor;
