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
export const CHAT_MODEL_SETTINGS_COMMAND = "open_chat_model_settings";
export const OVERLAY_WARNING_COMMAND = "warn_from_overlay";
export const CHAT_DICTATION_EVENT = "overlay-chat-dictation";
export const CHAT_DICTATION_COMMAND = {
  start: "start_chat_dictation",
  stop: "stop_chat_dictation",
  take: "take_transcript_for_chat",
} as const;
export const HELD_TRANSCRIPT_COMMAND = {
  copy: "copy_held_transcript",
  read: "get_held_transcript",
  send: "send_held_transcript_to_chat",
} as const;

/// Chat keeps writing with a dictated text, or asks a handed-over one as it stands.
export const DictatedTranscriptSchema = z.object({
  handover: z.enum(["ask", "compose"]),
  text: z.string(),
});

export type DictatedTranscript = z.infer<typeof DictatedTranscriptSchema>;

/// The HUD asks for chat and the model panel; Rust alone opens the transcript it could not place.
export const NotificationRequestSchema = z.enum([
  "chat",
  "panel",
  "transcript",
]);

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
