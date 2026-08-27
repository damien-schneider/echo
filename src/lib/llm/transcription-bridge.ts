import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Settings } from "@/lib/types";
import { runPostProcess } from "./post-process";

interface TranscriptionReadyPayload {
  op_generation: number;
  transcription: string;
}

// Bridge Rust transcription → frontend AI SDK post-process → Rust finalize (paste/history/overlay).
export function mountTranscriptionBridge(
  getSettings: () => Settings | null
): Promise<UnlistenFn> {
  return listen<TranscriptionReadyPayload>(
    "transcription-ready",
    async (event) => {
      const { transcription, op_generation } = event.payload;

      const settings = getSettings();
      if (!settings) {
        // Settings not loaded — paste raw.
        await invoke("finalize_transcription", {
          kind: "empty",
          opGeneration: op_generation,
          originalTranscription: transcription,
          postProcessPrompt: null,
          text: transcription,
          toolMessage: null,
        });
        return;
      }

      // On post-process error: still finalize with raw text so watchdog doesn't fire + overlay recovers.
      try {
        const result = await runPostProcess(transcription, settings);

        let postProcessPrompt: string | null = null;
        if (
          result.kind === "text" &&
          settings.post_process_selected_prompt_id
        ) {
          const prompt = settings.post_process_prompts.find(
            (p) => p.id === settings.post_process_selected_prompt_id
          );
          if (prompt) {
            postProcessPrompt = prompt.prompt;
          }
        }

        await invoke("finalize_transcription", {
          kind: result.kind,
          opGeneration: op_generation,
          originalTranscription: transcription,
          postProcessPrompt,
          text: result.content,
          toolMessage: result.toolMessage ?? null,
        });
      } catch (error) {
        console.error(
          "Post-processing failed, falling back to raw paste:",
          error
        );
        try {
          await invoke("finalize_transcription", {
            kind: "empty",
            opGeneration: op_generation,
            originalTranscription: transcription,
            postProcessPrompt: null,
            text: transcription,
            toolMessage: null,
          });
        } catch (finalizeError) {
          console.error(
            "Fallback finalize_transcription also failed:",
            finalizeError
          );
        }
      }
    }
  );
}
