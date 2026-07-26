import { z } from "zod";

// Two native windows, two independent channels. The HUD is the handle the user
// drags; the notification is what activity opens at the notch. Neither knows
// the other's geometry, so nothing ever travels between them.
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

/// The HUD can only ask for the two surfaces it has buttons for; activity opens
/// the notification on its own.
export const NotificationRequestSchema = z.enum(["chat", "panel"]);

export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;
