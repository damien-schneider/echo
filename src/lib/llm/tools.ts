import { invoke } from "@tauri-apps/api/core";
import { tool } from "ai";
import { z } from "zod";

const ToolResultSchema = z.object({
  display_message: z.string(),
  success: z.boolean(),
});

type ToolResultPayload = z.infer<typeof ToolResultSchema>;

export const voiceTools = {
  change_sound_theme: tool({
    description:
      "Cycle the audio feedback sound theme to the next option (Marimba -> Pop -> Custom -> Marimba).",
    inputSchema: z.object({}),
    execute: async (): Promise<ToolResultPayload> => {
      const result = await invoke<ToolResultPayload>(
        "execute_change_sound_theme"
      );
      return ToolResultSchema.parse(result);
    },
  }),

  create_note: tool({
    description: "Create a text note file with the given title and content.",
    inputSchema: z.object({
      title: z.string().describe("The title of the note (used as filename)"),
      content: z.string().describe("The text content of the note"),
    }),
    execute: async ({
      title,
      content,
    }: {
      title: string;
      content: string;
    }): Promise<ToolResultPayload> => {
      const result = await invoke<ToolResultPayload>("execute_create_note", {
        title,
        content,
      });
      return ToolResultSchema.parse(result);
    },
  }),

  open_application: tool({
    description: "Open an application by name on the user's system.",
    inputSchema: z.object({
      app_name: z.string().describe("The name of the application to open"),
    }),
    execute: async ({
      app_name,
    }: {
      app_name: string;
    }): Promise<ToolResultPayload> => {
      const result = await invoke<ToolResultPayload>(
        "execute_open_application",
        { appName: app_name }
      );
      return ToolResultSchema.parse(result);
    },
  }),
};
