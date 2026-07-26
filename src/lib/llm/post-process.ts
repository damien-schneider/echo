import { generateText, type StepResult, stepCountIs } from "ai";
import type { Settings } from "@/lib/types";
import { createLlmModel } from "./providers";
import { voiceTools } from "./tools";

const POST_PROCESS_RESULT_KINDS = {
  empty: "empty",
  text: "text",
  tool: "tool",
} as const;

type PostProcessResultKind =
  (typeof POST_PROCESS_RESULT_KINDS)[keyof typeof POST_PROCESS_RESULT_KINDS];

export interface PostProcessResult {
  content: string;
  kind: PostProcessResultKind;
  toolMessage?: string;
}

const MAX_TOOL_STEPS = 5;

// Mirrors Rust `maybe_post_process_transcription`. Tool-loop max 5 steps.
export async function runPostProcess(
  transcription: string,
  settings: Settings
): Promise<PostProcessResult> {
  if (!settings.post_process_enabled) {
    return { content: transcription, kind: "empty" };
  }

  const provider = settings.post_process_providers.find(
    (p) => p.id === settings.post_process_provider_id
  );
  if (!provider) {
    return { content: transcription, kind: "empty" };
  }

  const model = settings.post_process_models[provider.id] ?? "";
  if (!model.trim()) {
    return { content: transcription, kind: "empty" };
  }

  const selectedPromptId = settings.post_process_selected_prompt_id;
  if (!selectedPromptId) {
    return { content: transcription, kind: "empty" };
  }

  const promptConfig = settings.post_process_prompts.find(
    (p) => p.id === selectedPromptId
  );
  if (!promptConfig?.prompt.trim()) {
    return { content: transcription, kind: "empty" };
  }

  const apiKey = settings.post_process_api_keys[provider.id] ?? "";
  const llmModel = createLlmModel(provider, apiKey, model);

  const mentionRegex = /\[[^\]]*\]\(mention:output\)/g;
  const outputPlaceholder = ["$", "{output}"].join("");
  const processedPrompt = promptConfig.prompt
    .replace(mentionRegex, transcription)
    .replace(outputPlaceholder, transcription)
    .replace("@output", transcription);

  const useTools = settings.voice_commands_enabled ?? false;

  if (useTools) {
    // System message: routing + text-processing. User message: raw transcription.
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
        messages: [{ content: transcription, role: "user" }],
        model: llmModel,
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
        system: systemContent,
        tools: voiceTools,
      });

      return interpretResult(result.steps, transcription);
    } catch (error) {
      // Retry without tools for providers lacking function-calling.
      console.warn(
        "[Post-Process] Request with tools failed, retrying without tools:",
        error
      );
      return runWithoutTools(llmModel, processedPrompt, transcription);
    }
  }

  return runWithoutTools(llmModel, processedPrompt, transcription);
}

async function runWithoutTools(
  model: ReturnType<typeof createLlmModel>,
  prompt: string,
  originalTranscription: string
): Promise<PostProcessResult> {
  try {
    const result = await generateText({
      messages: [{ content: prompt, role: "user" }],
      model,
    });

    const text = result.text.trim();
    if (text) {
      return { content: text, kind: "text" };
    }
    return { content: originalTranscription, kind: "empty" };
  } catch (error) {
    console.error("[Post-Process] LLM request failed:", error);
    return { content: originalTranscription, kind: "empty" };
  }
}

// Tools called → "tool" + last message. Otherwise final text response.
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

  const lastStep = steps.at(-1);
  const finalText = lastStep?.text?.trim() ?? "";

  if (lastToolMessage) {
    return {
      content: finalText || lastToolMessage,
      kind: "tool",
      toolMessage: lastToolMessage,
    };
  }

  if (finalText) {
    return { content: finalText, kind: "text" };
  }

  return { content: originalTranscription, kind: "empty" };
}
