import { generateText, type Tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { postProcessTools } from "./tools";

export interface PostProcessConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  transcription: string;
}

export interface PostProcessResult {
  text: string;
  toolResults?: Array<{
    toolName: string;
    result: unknown;
  }>;
  success: boolean;
  error?: string;
}

/**
 * Performs post-processing of transcription using AI SDK v6 with tool support.
 * This allows the AI to execute actions like opening terminal or running commands
 * based on voice commands.
 */
export async function postProcessWithTools(
  config: PostProcessConfig
): Promise<PostProcessResult> {
  const { baseUrl, apiKey, model, prompt, transcription } = config;

  // Create OpenAI-compatible provider with custom base URL
  const provider = createOpenAI({
    baseURL: baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl,
    apiKey: apiKey || "dummy-key", // Some providers like Ollama don't need a key
  });

  // Replace mention placeholder with transcription
  // Handle multiple formats: [output](mention:output), ${output}, @output
  const mentionRegex = /\[[^\]]*\]\(mention:output\)/g;
  let processedPrompt = prompt.replace(mentionRegex, transcription);
  processedPrompt = processedPrompt
    .replace(/\$\{output\}/g, transcription)
    .replace(/@output/g, transcription);

  // Create system message that explains the tools available
  const systemMessage = `You are a helpful assistant that can process transcriptions and execute actions based on user requests.
If the transcription is a command to:
- Open a terminal: use the openTerminal tool
- Execute a shell command: use the executeCommand tool  
- Open a file, URL, or application: use the openFile tool

Otherwise, process the text according to the prompt instructions.

IMPORTANT: After using any tool, provide a brief natural language summary of what was done.`;

  try {
    const result = await generateText({
      model: provider(model),
      system: systemMessage,
      prompt: processedPrompt,
      tools: postProcessTools as Record<string, Tool>,
    });

    // Collect tool results from all steps if any tools were called
    const toolResults: Array<{ toolName: string; result: unknown }> = [];
    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolResults) {
          for (const toolResult of step.toolResults) {
            toolResults.push({
              toolName: toolResult.toolName,
              result: toolResult.output, // Use 'output' property from AI SDK v6
            });
          }
        }
      }
    }

    return {
      text: result.text,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
      success: true,
    };
  } catch (error) {
    console.error("[PostProcess] Error during AI SDK processing:", error);
    return {
      text: transcription, // Fall back to original transcription
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if the current environment supports tools (Tauri context)
 */
export function isToolSupportAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
