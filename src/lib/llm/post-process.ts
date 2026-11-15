import { invoke } from "@tauri-apps/api/core";
import { generateText } from "ai";
import { z } from "zod";
import { localLlmModel } from "@/lib/llm/local-model";
import { VOICE_COMMAND_SYSTEM_PROMPT } from "@/lib/llm/post-process-prompt";
import { runVoiceTool, type VoiceToolCall, voiceTools } from "@/lib/llm/tools";

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
  promptName?: string;
  toolMessage?: string;
}

export const unchangedTranscript = (
  transcription: string
): PostProcessResult => ({
  content: transcription,
  kind: POST_PROCESS_RESULT_KINDS.empty,
});

const DictationRewriteSchema = z
  .object({ prompt_name: z.string(), text: z.string() })
  .nullable();

export async function rewriteTranscript(
  transcription: string
): Promise<PostProcessResult> {
  const rewrite = DictationRewriteSchema.parse(
    await invoke("rewrite_dictation", { text: transcription })
  );
  return rewrite
    ? {
        content: rewrite.text,
        kind: POST_PROCESS_RESULT_KINDS.text,
        promptName: rewrite.prompt_name,
      }
    : unchangedTranscript(transcription);
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
