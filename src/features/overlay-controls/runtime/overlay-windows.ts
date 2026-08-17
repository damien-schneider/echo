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
export const NOTIFICATION_REQUEST_STATE_COMMAND =
  "get_overlay_notification_request";
export const CHAT_CONTEXT_EVENT = "overlay-chat-context";
export const CHAT_CONTEXT_STATE_COMMAND = "get_overlay_chat_context";
export const CHAT_CONTEXT_REFRESH_COMMAND = "refresh_overlay_chat_context";
export const CHAT_MODEL_SETTINGS_COMMAND = "open_chat_model_settings";
export const OVERLAY_WARNING_COMMAND = "warn_from_overlay";

/// The HUD may only ask for surfaces it has buttons for; activity opens the notification itself.
export const NotificationRequestSchema = z.enum(["chat", "panel"]);

export type NotificationRequest = z.infer<typeof NotificationRequestSchema>;
export const NotificationRequestEventSchema = z.object({
  generation: z.number().int().nonnegative(),
  surface: NotificationRequestSchema,
});

export type NotificationRequestEvent = z.infer<
  typeof NotificationRequestEventSchema
>;

export const ChatTextContextSchema = z.object({
  source: z.enum(["clipboard", "selection"]),
  truncated: z.boolean(),
  text: z.string(),
});

export type ChatTextContext = z.infer<typeof ChatTextContextSchema>;

export const ChatContextEventSchema = z.object({
  context: ChatTextContextSchema.nullable(),
  generation: z.number().int().nonnegative(),
  state: z.enum(["loading", "permission_required", "ready"]),
});

export type ChatContextEvent = z.infer<typeof ChatContextEventSchema>;
