import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { z } from "zod";
import {
  type PostProcessResult,
  rewriteTranscript,
  runVoiceCommand,
  unchangedTranscript,
} from "@/lib/llm/post-process";

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
  payload: TranscriptionReadyPayload
): Promise<PostProcessResult> =>
  payload.pass === "command"
    ? runVoiceCommand(
        payload.transcription,
        AbortSignal.timeout(payload.post_process_timeout_ms)
      )
    : rewriteTranscript(payload.transcription);

const finalize = (
  payload: TranscriptionReadyPayload,
  result: PostProcessResult
) =>
  invoke("finalize_transcription", {
    kind: result.kind,
    opGeneration: payload.op_generation,
    originalTranscription: payload.transcription,
    postProcessPrompt: result.promptName ?? null,
    text: result.content,
    toolMessage: result.toolMessage ?? null,
  });

// Any failure still finalizes with the raw text, so the overlay recovers before the watchdog fires.
const handleTranscriptionReady = async (payload: TranscriptionReadyPayload) => {
  try {
    await finalize(payload, await runModelPass(payload));
  } catch (error) {
    console.error("Post-processing failed, falling back to raw paste:", error);
    await finalize(payload, unchangedTranscript(payload.transcription)).catch(
      (finalizeError: unknown) => {
        console.error(
          "Fallback finalize_transcription also failed:",
          finalizeError
        );
      }
    );
  }
};

export function mountTranscriptionBridge(): Promise<UnlistenFn> {
  return listen<unknown>("transcription-ready", async (event) => {
    const payload = TranscriptionReadyPayloadSchema.safeParse(event.payload);
    if (!payload.success) {
      console.error("Malformed transcription-ready payload:", payload.error);
      return;
    }
    await handleTranscriptionReady(payload.data);
  });
}
