import { z } from "zod";

// two native windows, two channels — neither knows the other's geometry
export interface OverlayWindowChannel {
  prepareCommand: string;
  settleCommand: string;
  surfaceCommand: string;
  surfaceEvent: string;
}

export const HUD_WINDOW: OverlayWindowChannel = {
  prepareCommand: "set_recording_overlay_mode",
  settleCommand: "settle_recording_overlay_mode",
  surfaceCommand: "get_recording_overlay_surface",
  surfaceEvent: "overlay-surface",
};

export const NOTIFICATION_WINDOW: OverlayWindowChannel = {
  prepareCommand: "set_overlay_notification_mode",
  settleCommand: "settle_overlay_notification_mode",
  surfaceCommand: "get_overlay_notification_surface",
  surfaceEvent: "overlay-notification-surface",
};

export const NOTIFICATION_HIDE_COMMAND = "hide_overlay_notification";
export const NOTIFICATION_REQUEST_COMMAND = "request_overlay_notification";
export const NOTIFICATION_REQUEST_EVENT = "overlay-notification-request";
export const OVERLAY_WARNING_COMMAND = "warn_from_overlay";

/// The HUD may only ask for surfaces it has buttons for; activity opens the notification itself.
export const NotificationRequestSchema = z.enum(["chat", "panel"]);

export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;
