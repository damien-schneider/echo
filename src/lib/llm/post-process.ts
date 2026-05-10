import { generateText, type StepResult, stepCountIs } from "ai";
import type { Settings } from "@/lib/types";
import { createLlmModel } from "./providers";
import { voiceTools } from "./tools";

const POST_PROCESS_RESULT_KINDS = {
  text: "text",
  tool: "tool",
  empty: "empty",
} as const;

type PostProcessResultKind =
  (typeof POST_PROCESS_RESULT_KINDS)[keyof typeof POST_PROCESS_RESULT_KINDS];

export interface PostProcessResult {
  content: string;
  kind: PostProcessResultKind;
  toolMessage?: string;
}

const MAX_TOOL_STEPS = 5;

/**
 * Run LLM post-processing on a transcription.
 * Mirrors the Rust `maybe_post_process_transcription` logic:
 *   1. Find active provider / model / prompt
 *   2. Build messages (with tools if voice-commands enabled)
 *   3. Call the LLM with tool-loop (max 5 steps)
 *   4. Return discriminated result
 */
export async function runPostProcess(
  transcription: string,
  settings: Settings
): Promise<PostProcessResult> {
  if (!settings.post_process_enabled) {
    return { kind: "empty", content: transcription };
  }

  const provider = settings.post_process_providers.find(
    (p) => p.id === settings.post_process_provider_id
  );
  if (!provider) {
    return { kind: "empty", content: transcription };
  }

  const model = settings.post_process_models[provider.id] ?? "";
  if (!model.trim()) {
    return { kind: "empty", content: transcription };
  }

  const selectedPromptId = settings.post_process_selected_prompt_id;
  if (!selectedPromptId) {
    return { kind: "empty", content: transcription };
  }

  const promptConfig = settings.post_process_prompts.find(
    (p) => p.id === selectedPromptId
  );
  if (!promptConfig?.prompt.trim()) {
    return { kind: "empty", content: transcription };
  }

  const apiKey = settings.post_process_api_keys[provider.id] ?? "";
  const llmModel = createLlmModel(provider, apiKey, model);

  // Substitute mention placeholders
  const mentionRegex = /\[[^\]]*\]\(mention:output\)/g;
  const outputPlaceholder = ["$", "{output}"].join("");
  const processedPrompt = promptConfig.prompt
    .replace(mentionRegex, transcription)
    .replace(outputPlaceholder, transcription)
    .replace("@output", transcription);

  const useTools = settings.voice_commands_enabled ?? false;

  if (useTools) {
    // Voice-commands mode: system message carries routing logic +
    // text-processing instructions; user message is raw transcription.
    const systemContent = `You are a voice assistant that processes speech transcriptions. \
You have two roles:
1. **Voice commands**: If the user's speech is clearly a command \
(e.g. "open Safari", "create a note called ...", "change the sound theme"), \
use the appropriate tool. Do NOT output any text when executing a tool.
2. **Text processing**: If the speech is regular dictated text, \
apply the following instructions and return only the processed text \
with no extra commentary.

--- Text processing instructions ---
${promptConfig.prompt}`;

    try {
      const result = await generateText({
        model: llmModel,
        system: systemContent,
        messages: [{ role: "user", content: transcription }],
        tools: voiceTools,
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
      });

      return interpretResult(result.steps, transcription);
    } catch (error) {
      // Retry without tools for providers that don't support function calling
      console.warn(
        "[Post-Process] Request with tools failed, retrying without tools:",
        error
      );
      return runWithoutTools(llmModel, processedPrompt, transcription);
    }
  }

  // Text-only mode
  return runWithoutTools(llmModel, processedPrompt, transcription);
}

async function runWithoutTools(
  model: ReturnType<typeof createLlmModel>,
  prompt: string,
  originalTranscription: string
): Promise<PostProcessResult> {
  try {
    const result = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    const text = result.text.trim();
    if (text) {
      return { kind: "text", content: text };
    }
    return { kind: "empty", content: originalTranscription };
  } catch (error) {
    console.error("[Post-Process] LLM request failed:", error);
    return { kind: "empty", content: originalTranscription };
  }
}

/**
 * Walk through the step results to determine the outcome.
 * If any step executed tools, we return "tool" with the last tool message.
 * Otherwise, the final text response is the processed transcription.
 */
function interpretResult(
  steps: StepResult<typeof voiceTools>[],
  originalTranscription: string
): PostProcessResult {
  let lastToolMessage = "";

  for (const step of steps) {
    if (step.toolResults && step.toolResults.length > 0) {
      for (const toolResult of step.toolResults) {
        if (
          toolResult.output &&
          typeof toolResult.output === "object" &&
          "display_message" in toolResult.output
        ) {
          lastToolMessage = (toolResult.output as { display_message: string })
            .display_message;
        }
      }
    }
  }

  // Get the final text from the last step
  const lastStep = steps.at(-1);
  const finalText = lastStep?.text?.trim() ?? "";

  if (lastToolMessage) {
    // Tools were called — return the tool message or final LLM text
    return {
      kind: "tool",
      content: finalText || lastToolMessage,
      toolMessage: lastToolMessage,
    };
  }

  if (finalText) {
    return { kind: "text", content: finalText };
  }

  return { kind: "empty", content: originalTranscription };
}
