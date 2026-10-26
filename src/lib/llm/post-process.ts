import { generateText } from "ai";
import type { Settings } from "@/lib/types";
import { replaceMentionOutputInMarkdown } from "@/lib/utils/replace-mention-output";
import { localLlmModel } from "./local-model";
import { VOICE_COMMAND_SYSTEM_PROMPT } from "./post-process-prompt";
import { runVoiceTool, type VoiceToolCall, voiceTools } from "./tools";

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

export const unchangedTranscript = (
  transcription: string
): PostProcessResult => ({
  content: transcription,
  kind: POST_PROCESS_RESULT_KINDS.empty,
});

const textResult = (text: string, transcription: string): PostProcessResult => {
  const trimmed = text.trim();
  return trimmed
    ? { content: trimmed, kind: POST_PROCESS_RESULT_KINDS.text }
    : unchangedTranscript(transcription);
};

export const selectedPromptText = (settings: Settings) =>
  settings.post_process_prompts.find(
    (prompt) => prompt.id === settings.post_process_selected_prompt_id
  )?.prompt ?? null;

export async function rewriteTranscript(
  transcription: string,
  settings: Settings,
  abortSignal?: AbortSignal
): Promise<PostProcessResult> {
  const prompt = selectedPromptText(settings);
  if (!(settings.post_process_enabled && prompt?.trim())) {
    return unchangedTranscript(transcription);
  }
  try {
    const result = await generateText({
      abortSignal,
      messages: [
        {
          content: replaceMentionOutputInMarkdown(prompt, transcription),
          role: "user",
        },
      ],
      model: localLlmModel,
      temperature: 0,
    });
    return textResult(result.text, transcription);
  } catch (error) {
    console.error("[Post-Process] Rewrite failed:", error);
    return unchangedTranscript(transcription);
  }
}

export async function runVoiceCommand(
  transcription: string,
  abortSignal?: AbortSignal
): Promise<PostProcessResult> {
  try {
    const result = await generateText({
      abortSignal,
      messages: [{ content: transcription, role: "user" }],
      model: localLlmModel,
      system: VOICE_COMMAND_SYSTEM_PROMPT,
      temperature: 0,
      tools: voiceTools,
    });
    const calls = distinctToolCalls(result.staticToolCalls);
    if (calls.length === 0) {
      return unchangedTranscript(transcription);
    }
    let toolMessage = "";
    for (const call of calls) {
      toolMessage = (await runVoiceTool(call)).display_message;
    }
    return {
      content: toolMessage,
      kind: POST_PROCESS_RESULT_KINDS.tool,
      toolMessage,
    };
  } catch (error) {
    console.error("[Post-Process] Voice command failed:", error);
    return unchangedTranscript(transcription);
  }
}

/** A repeated identical call would run twice, and cycling the sound theme twice lands elsewhere. */
function distinctToolCalls(calls: VoiceToolCall[]): VoiceToolCall[] {
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.toolName}:${JSON.stringify(call.input)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
