import { listen } from "@tauri-apps/api/event";
import type { RefObject } from "react";
import { z } from "zod";
import { DownloadProgressSchema } from "@/features/model-download/download-state";
import {
  OverlayRemedySchema,
  updateMicrophoneAmbience,
} from "@/features/overlay-controls/recording-overlay-state";
import type { OverlayActivityEvent } from "@/features/overlay-controls/runtime/overlay-activity-state";
import {
  ModelDownloadTerminalSchema,
  TranscriptionProgressSchema,
} from "@/features/overlay-controls/runtime/overlay-event-payloads";
import {
  type OverlaySurface,
  OverlaySurfaceSchema,
} from "@/features/overlay-controls/runtime/overlay-surface";

const OverlayStateSchema = z.enum([
  "processing",
  "recording",
  "transcribing",
  "warning",
  "tool",
]);

const ShowOverlayPayloadSchema = z.union([
  OverlayStateSchema,
  z
    .object({
      action: OverlayRemedySchema.nullish(),
      message: z.string(),
      state: z.enum(["processing", "warning", "tool"]),
    })
    .strict(),
]);

export interface OverlayEventPorts {
  dispatch: (event: OverlayActivityEvent) => void;
  microphoneRef: RefObject<HTMLSpanElement | null>;
  onSurface: (surface: OverlaySurface | null) => void;
  surfaceEvent: string;
}

type ActivityPorts = Pick<OverlayEventPorts, "dispatch">;

/// The notification writes activity out; the HUD only needs it to light the record button.
const visibilityRegistrations = (ports: ActivityPorts) => [
  () =>
    listen<unknown>("show-overlay", (event) => {
      const parsed = ShowOverlayPayloadSchema.safeParse(event.payload);
      if (!parsed.success) {
        return;
      }
      const shown =
        typeof parsed.data === "string"
          ? { message: "", state: parsed.data }
          : parsed.data;
      ports.dispatch({ ...shown, type: "shown" });
    }),
  () => listen("hide-overlay", () => ports.dispatch({ type: "hidden" })),
];

const surfaceRegistration = (
  ports: Pick<OverlayEventPorts, "onSurface" | "surfaceEvent">
) => [
  () =>
    listen<unknown>(ports.surfaceEvent, (event) => {
      const parsed = OverlaySurfaceSchema.safeParse(event.payload);
      if (parsed.success) {
        ports.onSurface(parsed.data);
      }
    }),
];

const activityRegistrations = (ports: OverlayEventPorts) => [
  ...visibilityRegistrations(ports),
  () =>
    listen<unknown>("mic-level", (event) => {
      const parsed = z.array(z.number()).safeParse(event.payload);
      if (parsed.success && ports.microphoneRef.current) {
        updateMicrophoneAmbience(ports.microphoneRef.current, parsed.data);
      }
    }),
  () =>
    listen<unknown>("transcription-progress", (event) => {
      const parsed = TranscriptionProgressSchema.safeParse(event.payload);
      if (parsed.success) {
        ports.dispatch({ text: parsed.data, type: "progress" });
      }
    }),
];

const downloadRegistrations = (ports: OverlayEventPorts) => [
  () =>
    listen<unknown>("model-download-progress", (event) => {
      const parsed = DownloadProgressSchema.safeParse(event.payload);
      if (parsed.success) {
        ports.dispatch({ download: parsed.data, type: "download_progress" });
      }
    }),
  () =>
    listen<unknown>("model-download-complete", (event) => {
      const parsed = ModelDownloadTerminalSchema.safeParse(event.payload);
      if (parsed.success) {
        ports.dispatch({ modelId: parsed.data, type: "download_finished" });
      }
    }),
  () =>
    listen<unknown>("model-download-failed", (event) => {
      const parsed = ModelDownloadTerminalSchema.safeParse(event.payload);
      if (parsed.success) {
        ports.dispatch({ modelId: parsed.data, type: "download_finished" });
      }
    }),
];

export const overlayEventRegistrations = (ports: OverlayEventPorts) => [
  ...activityRegistrations(ports),
  ...downloadRegistrations(ports),
  ...surfaceRegistration(ports),
];

/// The HUD renders no transcript, download or microphone, so it skips those streams.
export const hudEventRegistrations = (
  ports: Omit<OverlayEventPorts, "microphoneRef">
) => [...visibilityRegistrations(ports), ...surfaceRegistration(ports)];
