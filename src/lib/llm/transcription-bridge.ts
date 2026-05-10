import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Settings } from "@/lib/types";
import { runPostProcess } from "./post-process";

interface TranscriptionReadyPayload {
  audio_samples: number[] | null;
  op_generation: number;
  transcription: string;
}

/**
 * Register the `transcription-ready` listener.
 * Returns an `unlisten` function for cleanup.
 *
 * This module bridges Rust (which handles recording / transcription) and the
 * frontend AI SDK (which handles LLM post-processing). Flow:
 *
 *   Rust emits `transcription-ready` with { transcription, op_generation }
 *   → frontend calls `runPostProcess` via AI SDK
 *   → frontend invokes `finalize_transcription` command
 *   → Rust handles paste, history, overlay, staleness
 */
export function mountTranscriptionBridge(
  getSettings: () => Settings | null
): Promise<UnlistenFn> {
  return listen<TranscriptionReadyPayload>(
    "transcription-ready",
    async (event) => {
      const { transcription, op_generation, audio_samples } = event.payload;

      const settings = getSettings();
      if (!settings) {
        // Settings not loaded yet — paste raw transcription
        await invoke("finalize_transcription", {
          text: transcription,
          originalTranscription: transcription,
          opGeneration: op_generation,
          kind: "empty",
          toolMessage: null,
          audioSamples: audio_samples,
          postProcessPrompt: null,
        });
        return;
      }

      const result = await runPostProcess(transcription, settings);

      // Resolve the prompt text for history
      let postProcessPrompt: string | null = null;
      if (result.kind === "text" && settings.post_process_selected_prompt_id) {
        const prompt = settings.post_process_prompts.find(
          (p) => p.id === settings.post_process_selected_prompt_id
        );
        if (prompt) {
          postProcessPrompt = prompt.prompt;
        }
      }

      await invoke("finalize_transcription", {
        text: result.content,
        originalTranscription: transcription,
        opGeneration: op_generation,
        kind: result.kind,
        toolMessage: result.toolMessage ?? null,
        audioSamples: audio_samples,
        postProcessPrompt,
      });
    }
  );
}
