import { generateText, type LanguageModel } from "ai";
import type { Settings } from "@/lib/types";
import { replaceMentionOutputInMarkdown } from "@/lib/utils/replace-mention-output";
import { localLlmModel } from "./local-model";
import { voiceCommandSystemPrompt } from "./post-process-prompt";
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

interface PostProcessRequest {
  abortSignal?: AbortSignal;
  model: LanguageModel;
  temperature?: number;
}

const unchanged = (transcription: string): PostProcessResult => ({
  content: transcription,
  kind: POST_PROCESS_RESULT_KINDS.empty,
});

const textResult = (text: string, transcription: string): PostProcessResult => {
  const trimmed = text.trim();
  return trimmed
    ? { content: trimmed, kind: POST_PROCESS_RESULT_KINDS.text }
    : unchanged(transcription);
};

export async function runPostProcess(
  transcription: string,
  settings: Settings,
  abortSignal?: AbortSignal
): Promise<PostProcessResult> {
  if (!settings.post_process_enabled) {
    return unchanged(transcription);
  }
  const promptConfig = settings.post_process_prompts.find(
    (p) => p.id === settings.post_process_selected_prompt_id
  );
  if (!promptConfig?.prompt.trim()) {
    return unchanged(transcription);
  }
  const request: PostProcessRequest = {
    abortSignal,
    model: localLlmModel,
    temperature: 0,
  };
  if (settings.voice_commands_enabled) {
    return await runWithVoiceCommands(
      request,
      promptConfig.prompt,
      transcription
    );
  }
  return await runWithoutTools(request, promptConfig.prompt, transcription);
}

interface VoiceCommandAnswer {
  calls: VoiceToolCall[];
  text: string;
}

async function requestWithVoiceTools(
  request: PostProcessRequest,
  textInstructions: string,
  transcription: string
): Promise<VoiceCommandAnswer> {
  const result = await generateText({
    ...request,
    messages: [{ content: transcription, role: "user" }],
    system: voiceCommandSystemPrompt(textInstructions),
    tools: voiceTools,
  });
  return {
    calls: distinctToolCalls(result.staticToolCalls),
    text: result.text,
  };
}

async function runWithVoiceCommands(
  request: PostProcessRequest,
  textInstructions: string,
  transcription: string
): Promise<PostProcessResult> {
  let answer: VoiceCommandAnswer;
  try {
    answer = await requestWithVoiceTools(
      request,
      textInstructions,
      transcription
    );
  } catch (error) {
    console.warn(
      "[Post-Process] Request with tools failed, retrying without tools:",
      error
    );
    return runWithoutTools(request, textInstructions, transcription);
  }
  if (answer.calls.length === 0) {
    return textResult(answer.text, transcription);
  }
  let toolMessage = "";
  for (const call of answer.calls) {
    toolMessage = (await runVoiceTool(call)).display_message;
  }
  return {
    content: toolMessage,
    kind: POST_PROCESS_RESULT_KINDS.tool,
    toolMessage,
  };
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

async function runWithoutTools(
  request: PostProcessRequest,
  textInstructions: string,
  transcription: string
): Promise<PostProcessResult> {
  try {
    const result = await generateText({
      ...request,
      messages: [
        {
          content: replaceMentionOutputInMarkdown(
            textInstructions,
            transcription
          ),
          role: "user",
        },
      ],
    });
    return textResult(result.text, transcription);
  } catch (error) {
    console.error("[Post-Process] LLM request failed:", error);
    return unchanged(transcription);
  }
}
