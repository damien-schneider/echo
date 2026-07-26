import { z } from "zod";

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
  "--preview-height": `${payload.height}px`,
  "--preview-width": `${payload.width}px`,
  "--preview-x": `${payload.x}px`,
  "--preview-y": `${payload.y}px`,
});

// Only an edge change is worth animating: along one edge the placeholder must
// track the pointer 1:1, and a restarted transition reads as stutter.
export const previewGlides = (
  painted: SnapPreviewPayload | null,
  next: SnapPreviewPayload
) => painted !== null && painted.anchor !== next.anchor;
