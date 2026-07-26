import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { PostProcessProvider } from "@/lib/types";

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

  // Ollama: SDK requires non-empty key; pass dummy.
  const effectiveKey = provider.id === "ollama" && !apiKey ? "ollama" : apiKey;

  const openai = createOpenAICompatible({
    apiKey: effectiveKey,
    baseURL: baseUrl,
    name: provider.id,
  });
  return openai(modelId);
}
