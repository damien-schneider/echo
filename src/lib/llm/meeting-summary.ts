import { generateText } from "ai";
import type { Settings } from "@/lib/types";
import { createLlmModel } from "./providers";

/**
 * Generate a meeting summary from a formatted transcript.
 * Mirrors the Rust `generate_summary` LLM call.
 */
export async function generateMeetingSummary(
  transcript: string,
  settings: Settings
): Promise<string> {
  const provider = settings.post_process_providers.find(
    (p) => p.id === settings.post_process_provider_id
  );
  if (!provider) {
    throw new Error("No post-processing provider configured");
  }

  const apiKey = settings.post_process_api_keys[provider.id] ?? "";
  const modelId = settings.post_process_models[provider.id] ?? "";
  if (!modelId.trim()) {
    throw new Error("No post-processing model configured");
  }

  const model = createLlmModel(provider, apiKey, modelId);

  const prompt = `Summarize this meeting transcript. Include:
1. Key topics discussed
2. Decisions made
3. Action items with assignees
4. Important dates/deadlines mentioned

Transcript:
${transcript}`;

  const result = await generateText({
    model,
    system:
      "You are a meeting summary assistant. Produce concise, actionable summaries.",
    messages: [{ role: "user", content: prompt }],
  });

  return result.text;
}
