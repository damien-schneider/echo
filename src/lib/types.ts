import { z } from "zod";
import { TranscriptionLanguageSchema } from "@/lib/constants/languages";

export const ShortcutBindingSchema = z.object({
  current_binding: z.string(),
  default_binding: z.string(),
  description: z.string(),
  id: z.string(),
  name: z.string(),
});

export const ShortcutBindingsMapSchema = z.record(
  z.string(),
  ShortcutBindingSchema
);

export const AudioDeviceSchema = z.object({
  index: z.string(),
  is_default: z.boolean(),
  name: z.string(),
});

export const OverlayPositionSchema = z.enum(["none", "edge", "top", "bottom"]);
export type OverlayPosition = z.infer<typeof OverlayPositionSchema>;

export const OverlayDockEdgeSchema = z.enum(["left", "right", "top", "bottom"]);
export type OverlayDockEdge = z.infer<typeof OverlayDockEdgeSchema>;

export const TranscriptionModelSizeSchema = z.enum([
  "small",
  "medium",
  "large",
]);
export type TranscriptionModelSize = z.infer<
  typeof TranscriptionModelSizeSchema
>;

export const TranscriptionProfileStatusSchema = z
  .object({
    description: z.string(),
    download_size_mb: z.number().nonnegative(),
    is_active: z.boolean(),
    is_downloaded: z.boolean(),
    is_downloading: z.boolean(),
    is_recommended: z.boolean(),
    label: z.string(),
    size: TranscriptionModelSizeSchema,
  })
  .strict();
export type TranscriptionProfileStatus = z.infer<
  typeof TranscriptionProfileStatusSchema
>;

export const PolishStateSchema = z.enum([
  "not_downloaded",
  "preparing",
  "downloading",
  "verifying",
  "loading",
  "ready",
  "repair",
]);
export const PolishStatusSchema = z
  .object({
    message: z.string(),
    state: PolishStateSchema,
  })
  .strict();
export type PolishStatus = z.infer<typeof PolishStatusSchema>;

export const PasteMethodSchema = z.enum([
  "ctrl_v",
  "direct",
  "shift_insert",
  "clipboard_only",
]);
export type PasteMethod = z.infer<typeof PasteMethodSchema>;

export const ClipboardHandlingSchema = z.enum([
  "dont_modify",
  "copy_to_clipboard",
]);
export type ClipboardHandling = z.infer<typeof ClipboardHandlingSchema>;

export const MeetingSummaryEngineSchema = z.enum(["local", "cloud"]);
export type MeetingSummaryEngine = z.infer<typeof MeetingSummaryEngineSchema>;

export const PolishLevelSchema = z.enum(["correct", "natural", "clear"]);
export type PolishLevel = z.infer<typeof PolishLevelSchema>;

export const RecordingRetentionPeriodSchema = z.enum([
  "never",
  "preserve_limit",
  "days3",
  "weeks2",
  "months3",
]);
export type RecordingRetentionPeriod = z.infer<
  typeof RecordingRetentionPeriodSchema
>;

export const LLMPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
});

export type LLMPrompt = z.infer<typeof LLMPromptSchema>;

export const PostProcessProviderSchema = z.object({
  allow_base_url_edit: z.boolean().optional().default(false),
  base_url: z.string(),
  id: z.string(),
  kind: z
    .enum(["openai_compatible", "anthropic"])
    .optional()
    .default("openai_compatible"),
  label: z.string(),
  models_endpoint: z.string().nullable().optional(),
});

export type PostProcessProvider = z.infer<typeof PostProcessProviderSchema>;

export const DictionaryEntrySchema = z.object({
  canonical: z.string(),
  variants: z.array(z.string()).optional().default([]),
});

export type DictionaryEntry = z.infer<typeof DictionaryEntrySchema>;

export const CaptureSchema = z.object({
  app_name: z.string().nullable(),
  content: z.string(),
  id: z.number(),
  timestamp: z.number(),
});

export type Capture = z.infer<typeof CaptureSchema>;

export const CapturesSchema = z.array(CaptureSchema);

export const SettingsSchema = z.object({
  always_on_microphone: z.boolean(),
  audio_feedback: z.boolean(),
  audio_feedback_volume: z.number().optional().default(1.0),
  autostart_enabled: z.boolean().optional().default(false),
  bindings: ShortcutBindingsMapSchema,
  clamshell_microphone: z.string().nullable().optional(),
  cleanup_app_context_enabled: z.boolean().optional().default(false),
  cleanup_dictionary: z.array(DictionaryEntrySchema).optional().default([]),
  cleanup_enabled: z.boolean().optional().default(false),
  clipboard_handling: ClipboardHandlingSchema.optional().default("dont_modify"),
  custom_words: z.array(z.string()).optional().default([]),
  debug_logging_enabled: z.boolean().optional().default(false),
  debug_mode: z.boolean(),
  double_shift_capture_enabled: z.boolean().optional().default(true),
  history_limit: z.number().optional().default(5),
  input_tracking_enabled: z.boolean().optional().default(false),
  input_tracking_excluded_apps: z.array(z.string()).optional().default([]),
  input_tracking_idle_timeout: z.number().nullable().optional().default(2),
  log_level: z.number().int().min(1).max(5).optional().default(2),
  meeting_auto_summary: z.boolean().optional().default(false),
  meeting_chunk_duration_secs: z.number().optional().default(30),
  meeting_summary_engine:
    MeetingSummaryEngineSchema.optional().default("local"),
  meeting_system_audio_enabled: z.boolean().optional().default(false),
  mute_while_recording: z.boolean().optional().default(false),
  overlay_dock_edge: OverlayDockEdgeSchema.optional().default("right"),
  overlay_dock_offset: z.number().min(0).max(1).optional().default(0.5),
  overlay_position: OverlayPositionSchema,
  paste_method: PasteMethodSchema.optional().default("ctrl_v"),
  polish_level: PolishLevelSchema.optional().default("natural"),
  post_process_api_keys: z
    .record(z.string(), z.string())
    .optional()
    .default({}),
  post_process_enabled: z.boolean().optional().default(false),
  post_process_models: z.record(z.string(), z.string()).optional().default({}),
  post_process_prompts: z.array(LLMPromptSchema).optional().default([]),
  post_process_provider_id: z.string().optional().default("openai"),
  post_process_providers: z
    .array(PostProcessProviderSchema)
    .optional()
    .default([]),
  post_process_selected_prompt_id: z.string().nullable().optional(),
  push_to_talk: z.boolean(),
  recording_retention_period:
    RecordingRetentionPeriodSchema.optional().default("preserve_limit"),
  selected_language: TranscriptionLanguageSchema,
  selected_microphone: z.string().nullable().optional(),
  selected_output_device: z.string().nullable().optional(),
  sound_theme: z
    .enum(["marimba", "pop", "custom"])
    .optional()
    .default("marimba"),
  start_hidden: z.boolean().optional().default(false),
  transcription_model_size:
    TranscriptionModelSizeSchema.optional().default("medium"),
  translate_to_english: z.boolean(),
  tts_enabled: z.boolean().optional().default(false),
  voice_commands_enabled: z.boolean().optional().default(true),
  word_correction_threshold: z.number().optional().default(0.18),
});

export const BindingResponseSchema = z.object({
  binding: ShortcutBindingSchema.nullable(),
  error: z.string().nullable(),
  success: z.boolean(),
});

export type AudioDevice = z.infer<typeof AudioDeviceSchema>;
export type BindingResponse = z.infer<typeof BindingResponseSchema>;
export type ShortcutBinding = z.infer<typeof ShortcutBindingSchema>;
export type ShortcutBindingsMap = z.infer<typeof ShortcutBindingsMapSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export const FileTranscriptionProgressSchema = z.object({
  message: z.string(),
  progress: z.number(),
  status: z.string(),
});

export type FileTranscriptionProgress = z.infer<
  typeof FileTranscriptionProgressSchema
>;

export const ActiveMeetingSchema = z.discriminatedUnion("state", [
  z
    .object({
      meeting_id: z.number(),
      start_time: z.number(),
      state: z.literal("recording"),
    })
    .strict(),
  z.object({ state: z.literal("processing") }).strict(),
]);
export type ActiveMeeting = z.infer<typeof ActiveMeetingSchema>;

export const MeetingStatusSchema = z.enum([
  "recording",
  "processing",
  "recorded",
  "complete",
  "partial",
  "error",
]);
export type MeetingStatus = z.infer<typeof MeetingStatusSchema>;

export const ExportFormatSchema = z.enum(["srt", "vtt", "txt", "markdown"]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const MeetingSegmentSchema = z.object({
  audio_source: z.string(),
  confidence: z.number().nullable().optional(),
  end_ms: z.number(),
  id: z.number(),
  meeting_id: z.number(),
  speaker_label: z.string(),
  start_ms: z.number(),
  text: z.string(),
});
export type MeetingSegment = z.infer<typeof MeetingSegmentSchema>;

export const StreamingSourceSchema = z.enum(["mic", "system"]);
export type StreamingSource = z.infer<typeof StreamingSourceSchema>;

export const MeetingAudioWarningSchema = z.object({
  reason: z.enum(["device", "write"]),
  source: StreamingSourceSchema,
});
export type MeetingAudioWarning = z.infer<typeof MeetingAudioWarningSchema>;

export const StreamingInterimSchema = z.object({
  committed_text: z.string(),
  meeting_id: z.number(),
  segment_start_ms: z.number(),
  source: StreamingSourceSchema,
  tentative_text: z.string(),
});
export type StreamingInterim = z.infer<typeof StreamingInterimSchema>;

export const StreamingFinalSchema = z.object({
  end_ms: z.number(),
  meeting_id: z.number(),
  source: StreamingSourceSchema,
  start_ms: z.number(),
  text: z.string(),
});
export type StreamingFinal = z.infer<typeof StreamingFinalSchema>;

export const BatchPhaseSchema = z.enum(["transcribing", "diarizing", "done"]);
export type BatchPhase = z.infer<typeof BatchPhaseSchema>;

export const MeetingBatchProgressSchema = z.object({
  chunks_done: z.number(),
  chunks_total: z.number(),
  meeting_id: z.number(),
  phase: BatchPhaseSchema,
  source: z.string(),
});
export type MeetingBatchProgress = z.infer<typeof MeetingBatchProgressSchema>;

export const MeetingSchema = z.object({
  duration_ms: z.number().nullable().optional(),
  end_time: z.number().nullable().optional(),
  id: z.number(),
  mic_file_name: z.string().nullable().optional(),
  start_time: z.number(),
  status: MeetingStatusSchema,
  summary: z.string().nullable().optional(),
  system_file_name: z.string().nullable().optional(),
  title: z.string(),
});
export type Meeting = z.infer<typeof MeetingSchema>;
