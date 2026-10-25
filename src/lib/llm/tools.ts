import { invoke } from "@tauri-apps/api/core";
import { type StaticToolCall, tool } from "ai";
import { z } from "zod";

const ToolResultSchema = z.object({
  display_message: z.string(),
  success: z.boolean(),
});

type ToolResultPayload = z.infer<typeof ToolResultSchema>;

export const voiceTools = {
  cycle_feedback_sounds: tool({
    description:
      "Switch Echo's feedback sounds to the next sound theme, thème sonore (Marimba -> Custom -> Marimba).",
    inputSchema: z.object({}),
  }),

  create_note: tool({
    description: "Create a text note file with the given title and content.",
    inputSchema: z.object({
      content: z.string().describe("The text content of the note"),
      title: z.string().describe("The title of the note (used as filename)"),
    }),
  }),

  open_application: tool({
    description: "Open an application by name on the user's system.",
    inputSchema: z.object({
      app_name: z.string().describe("The name of the application to open"),
    }),
  }),
};

export type VoiceToolCall = StaticToolCall<typeof voiceTools>;

const invokeVoiceTool = (call: VoiceToolCall): Promise<unknown> => {
  switch (call.toolName) {
    case "cycle_feedback_sounds":
      return invoke("execute_change_sound_theme");
    case "create_note":
      return invoke("execute_create_note", {
        content: call.input.content,
        title: call.input.title,
      });
    case "open_application":
      return invoke("execute_open_application", {
        appName: call.input.app_name,
      });
    default:
      throw new Error(`Unknown voice tool: ${call satisfies never}`);
  }
};

export async function runVoiceTool(
  call: VoiceToolCall
): Promise<ToolResultPayload> {
  return ToolResultSchema.parse(await invokeVoiceTool(call));
}
