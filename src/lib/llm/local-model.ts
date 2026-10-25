import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { invoke } from "@tauri-apps/api/core";
import type { LanguageModel } from "ai";
import { z } from "zod";

const LocalCompletionSchema = z.object({
  body: z.string(),
  status: z.number(),
});

const rejectOnAbort = (signal: AbortSignal | null | undefined) =>
  new Promise<never>((_, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });

const forwardToLocalModel = async (
  _input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  init?.signal?.throwIfAborted();
  if (typeof init?.body !== "string") {
    throw new Error("The local model only accepts JSON chat completions");
  }
  const forwarded = invoke("forward_local_chat_completion", {
    body: init.body,
  });
  const completion = LocalCompletionSchema.parse(
    await Promise.race([forwarded, rejectOnAbort(init.signal)])
  );
  return new Response(completion.body, {
    headers: { "content-type": "application/json" },
    status: completion.status,
  });
};

const localProvider = createOpenAICompatible({
  baseURL: "http://qwen3-4b.invalid/v1",
  fetch: forwardToLocalModel,
  name: "echo",
});

export const localLlmModel: LanguageModel = localProvider("qwen3-4b");
