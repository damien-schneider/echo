import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";
import type { Settings } from "@/lib/types";
import {
  type PostProcessResult,
  rewriteTranscript,
  runVoiceCommand,
  selectedPromptText,
  unchangedTranscript,
} from "./post-process";

const TranscriptionReadyPayloadSchema = z.object({
  op_generation: z.number(),
  pass: z.enum(["rewrite", "command"]),
  post_process_timeout_ms: z.number(),
  transcription: z.string(),
});

type TranscriptionReadyPayload = z.infer<
  typeof TranscriptionReadyPayloadSchema
>;

const runModelPass = (
  payload: TranscriptionReadyPayload,
  settings: Settings
): Promise<PostProcessResult> => {
  const abortSignal = AbortSignal.timeout(payload.post_process_timeout_ms);
  return payload.pass === "command"
    ? runVoiceCommand(payload.transcription, abortSignal)
    : rewriteTranscript(payload.transcription, settings, abortSignal);
};

const finalize = (
  payload: TranscriptionReadyPayload,
  result: PostProcessResult,
  postProcessPrompt: string | null
) =>
  invoke("finalize_transcription", {
    kind: result.kind,
    opGeneration: payload.op_generation,
    originalTranscription: payload.transcription,
    postProcessPrompt,
    text: result.content,
    toolMessage: result.toolMessage ?? null,
  });

// Any failure still finalizes with the raw text, so the overlay recovers before the watchdog fires.
const handleTranscriptionReady = async (
  payload: TranscriptionReadyPayload,
  settings: Settings | null
) => {
  const raw = unchangedTranscript(payload.transcription);
  if (!settings) {
    await finalize(payload, raw, null);
    return;
  }
  try {
    const result = await runModelPass(payload, settings);
    const prompt = result.kind === "text" ? selectedPromptText(settings) : null;
    await finalize(payload, result, prompt);
  } catch (error) {
    console.error("Post-processing failed, falling back to raw paste:", error);
    await finalize(payload, raw, null).catch((finalizeError: unknown) => {
      console.error(
        "Fallback finalize_transcription also failed:",
        finalizeError
      );
    });
  }
};

export function mountTranscriptionBridge(
  getSettings: () => Settings | null
): Promise<UnlistenFn> {
  return listen<unknown>("transcription-ready", async (event) => {
    const payload = TranscriptionReadyPayloadSchema.safeParse(event.payload);
    if (!payload.success) {
      console.error("Malformed transcription-ready payload:", payload.error);
      return;
    }
    await handleTranscriptionReady(payload.data, getSettings());
  });
}
