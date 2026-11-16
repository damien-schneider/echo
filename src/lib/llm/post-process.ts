import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

const POST_PROCESS_RESULT_KINDS = {
  empty: "empty",
  text: "text",
} as const;

type PostProcessResultKind =
  (typeof POST_PROCESS_RESULT_KINDS)[keyof typeof POST_PROCESS_RESULT_KINDS];

export interface PostProcessResult {
  content: string;
  kind: PostProcessResultKind;
  promptName?: string;
}

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
    : { content: transcription, kind: POST_PROCESS_RESULT_KINDS.empty };
}
