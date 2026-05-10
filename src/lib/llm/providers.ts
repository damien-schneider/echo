import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { PostProcessProvider } from "@/lib/types";

/**
 * Build a Vercel AI SDK `LanguageModel` for the given provider + model ID.
 */
const TRAILING_SLASHES = /\/+$/;

export function createLlmModel(
  provider: PostProcessProvider,
  apiKey: string,
  modelId: string
): LanguageModel {
  const baseUrl = provider.base_url.replace(TRAILING_SLASHES, "");

  if (provider.kind === "anthropic") {
    const anthropic = createAnthropic({
      apiKey,
      baseURL: baseUrl,
      headers: { "anthropic-version": "2023-06-01" },
    });
    return anthropic(modelId);
  }

  // Ollama doesn't need a key — use a dummy value so the SDK doesn't reject it
  const effectiveKey = provider.id === "ollama" && !apiKey ? "ollama" : apiKey;

  const openai = createOpenAICompatible({
    name: provider.id,
    apiKey: effectiveKey,
    baseURL: baseUrl,
  });
  return openai(modelId);
}
